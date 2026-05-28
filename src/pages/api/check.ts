import type { APIRoute } from "astro";
import { callCached, parseJson } from "../../lib/anthropic";
import { readDemo, consumeDemo } from "../../lib/rate-limit";
import { VOICE_SYSTEM_PROMPT } from "../../prompts/system";
import {
  parseVoiceDoc,
  runDeterministicChecks,
  computeDeterministicSubScores,
} from "../../lib/deterministic-checks";
import {
  type VoiceResult,
  type LlmVoiceJudgment,
  type VoiceFlag,
  type VoiceBand,
  bandFor,
  compositeFrom,
  pairwiseToScore,
} from "../../lib/voice-types";
import type { ApiResponse } from "../../lib/types";

export const prerender = false;

/** Ordered band scale for adjacency checks. */
const BAND_ORDER: VoiceBand[] = [
  "rewrite-needed",
  "off-brand",
  "drifting",
  "mostly-on-brand",
  "on-brand",
];

function bandDistance(a: VoiceBand, b: VoiceBand): number {
  return Math.abs(BAND_ORDER.indexOf(a) - BAND_ORDER.indexOf(b));
}

async function callLlmOnce(
  voiceDoc: string,
  draft: string
): Promise<LlmVoiceJudgment> {
  const userInput = `BRAND VOICE DOC:\n\n${voiceDoc}\n\n---\n\nDRAFT TO CHECK:\n\n${draft}`;
  const { text } = await callCached({
    systemPrompt: VOICE_SYSTEM_PROMPT,
    userInput,
    maxTokens: 1800,
  });
  const parsed = parseJson<Partial<LlmVoiceJudgment>>(text);
  return {
    tone_score_1_5: clamp1to5(parsed.tone_score_1_5),
    cadence_score_1_5: clamp1to5(parsed.cadence_score_1_5),
    tone_reason: parsed.tone_reason ?? "",
    cadence_reason: parsed.cadence_reason ?? "",
    flags: Array.isArray(parsed.flags) ? parsed.flags : [],
    rewritten_draft: parsed.rewritten_draft ?? draft,
  };
}

function clamp1to5(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 3;
  return Math.max(1, Math.min(5, Math.round(n)));
}

/** Average a list of numbers, rounded to int. */
function avg(xs: number[]): number {
  return Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
}

/**
 * Dedupe LLM flags by phrase (case-insensitive). When two runs flag the same
 * phrase, keep the citation from the first run.
 */
function dedupeLlmFlags(flags: VoiceFlag[]): VoiceFlag[] {
  const out: VoiceFlag[] = [];
  const seen = new Set<string>();
  for (const f of flags) {
    const key = f.phrase.toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

/**
 * Compose a single-sentence score reason from the LLM reasons + flag counts.
 * The deterministic flags get summarized by count; the LLM reasons get
 * surfaced as the qualitative reading.
 */
function composeReason(
  llmRuns: LlmVoiceJudgment[],
  deterministicFlagCount: number,
  band: VoiceBand
): string {
  const llmReasonsTone = llmRuns
    .map((r) => r.tone_reason)
    .filter(Boolean);
  const llmReasonsCadence = llmRuns
    .map((r) => r.cadence_reason)
    .filter(Boolean);

  const detSummary =
    deterministicFlagCount === 0
      ? ""
      : `${deterministicFlagCount} rule-based flag${deterministicFlagCount === 1 ? "" : "s"}`;
  const tonePart = llmReasonsTone[0] ?? "";
  const cadencePart = llmReasonsCadence[0] ?? "";

  if (band === "on-brand") {
    return tonePart || "Reads on-brand across tone, cadence, and rules.";
  }
  const parts = [detSummary, tonePart, cadencePart].filter(Boolean);
  return parts.join(" · ");
}

export const POST: APIRoute = async ({ request }) => {
  // Step 1 — rate limit
  const usage = await readDemo(request);
  if (usage.exceeded) {
    return json<VoiceResult>({
      ok: false,
      error: "rate_limit_exceeded",
      message: "Demo limit reached. Fork the repo to keep using.",
    });
  }

  // Step 2 — validate input
  let body: { voiceDoc?: string; draft?: string };
  try {
    body = await request.json();
  } catch {
    return json<VoiceResult>({
      ok: false,
      error: "invalid_input",
      message: "Body must be JSON with `voiceDoc` and `draft` fields.",
    });
  }
  const voiceDoc = (body.voiceDoc ?? "").trim();
  const draft = (body.draft ?? "").trim();
  if (!voiceDoc || !draft) {
    return json<VoiceResult>({
      ok: false,
      error: "invalid_input",
      message: "Paste both the voice doc and a draft.",
    });
  }
  if (voiceDoc.length > 12000 || draft.length > 6000) {
    return json<VoiceResult>({
      ok: false,
      error: "invalid_input",
      message: "Inputs too long. Voice doc ≤12k chars, draft ≤6k chars.",
    });
  }

  // Step 3 — deterministic pre-pass (free, instant, 100% recall on rules).
  const parsedDoc = parseVoiceDoc(voiceDoc);
  const deterministicFlags = runDeterministicChecks(draft, parsedDoc);
  const detSubScores = computeDeterministicSubScores(
    draft,
    parsedDoc,
    deterministicFlags
  );

  // Step 4 — N=2 LLM calls in parallel for tone + cadence + rewrite.
  let llmRuns: LlmVoiceJudgment[];
  try {
    llmRuns = await Promise.all([
      callLlmOnce(voiceDoc, draft),
      callLlmOnce(voiceDoc, draft),
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = msg.includes("ANTHROPIC_API_KEY")
      ? "missing_api_key"
      : "anthropic_error";
    return json<VoiceResult>({ ok: false, error: code, message: msg });
  }

  // Step 5 — band-level agreement check. If the two runs land in
  // non-adjacent bands when composited with the deterministic sub-scores,
  // fire a third tie-break call.
  const subScoresPerRun = llmRuns.map((run) => ({
    vocabulary: detSubScores.vocabulary,
    punctuation: detSubScores.punctuation,
    tone: pairwiseToScore(run.tone_score_1_5),
    cadence: pairwiseToScore(run.cadence_score_1_5),
  }));
  const bandsPerRun = subScoresPerRun.map(
    (s) => bandFor(compositeFrom(s)).band
  );
  const initialDistance = bandDistance(bandsPerRun[0], bandsPerRun[1]);

  if (initialDistance >= 2) {
    try {
      const tieBreak = await callLlmOnce(voiceDoc, draft);
      llmRuns.push(tieBreak);
    } catch {
      // Tie-break failed — proceed with the two we have. Confidence stays low.
    }
  }

  // Step 6 — aggregate the final score across runs.
  const finalToneScore = avg(
    llmRuns.map((r) => pairwiseToScore(r.tone_score_1_5))
  );
  const finalCadenceScore = avg(
    llmRuns.map((r) => pairwiseToScore(r.cadence_score_1_5))
  );
  const finalSubScores = {
    vocabulary: detSubScores.vocabulary,
    punctuation: detSubScores.punctuation,
    tone: finalToneScore,
    cadence: finalCadenceScore,
  };
  const composite = compositeFrom(finalSubScores);
  const { band, label } = bandFor(composite);

  // Confidence: based on the original N=2 band agreement.
  let confidence: "high" | "medium" | "low";
  if (initialDistance === 0) confidence = "high";
  else if (initialDistance === 1) confidence = "medium";
  else confidence = "low";

  // Merge flags: deterministic + de-duped LLM flags. Drop any LLM flag whose
  // phrase already appears in the deterministic set (case-insensitive) to
  // avoid double-citation.
  const detPhrases = new Set(
    deterministicFlags.map((f) => f.phrase.toLowerCase().trim())
  );
  const llmFlags = dedupeLlmFlags(
    llmRuns.flatMap((r) => r.flags).filter((f) => !detPhrases.has(f.phrase.toLowerCase().trim()))
  );
  const mergedFlags = [...deterministicFlags, ...llmFlags];

  // Pick the rewrite from the run with tone+cadence scores closest to the
  // averaged final score (so the rewrite reflects the consensus reading).
  const bestRunIdx = llmRuns
    .map((r, i) => ({
      i,
      distance:
        Math.abs(pairwiseToScore(r.tone_score_1_5) - finalToneScore) +
        Math.abs(pairwiseToScore(r.cadence_score_1_5) - finalCadenceScore),
    }))
    .sort((a, b) => a.distance - b.distance)[0].i;
  const rewritten_draft = llmRuns[bestRunIdx].rewritten_draft;

  const score_reason = composeReason(llmRuns, deterministicFlags.length, band);

  const result: VoiceResult = {
    composite_score: composite,
    band,
    band_label: label,
    sub_scores: finalSubScores,
    score_reason,
    flags: mergedFlags,
    rewritten_draft,
    confidence,
  };

  await consumeDemo(request);
  const remaining =
    usage.remaining === Infinity ? -1 : Math.max(0, usage.remaining - 1);

  return json<VoiceResult>({ ok: true, data: result, remaining });
};

function json<T>(payload: ApiResponse<T>): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
