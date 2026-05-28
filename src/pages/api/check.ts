import type { APIRoute } from "astro";
import { callCached, parseJson } from "../../lib/anthropic";
import { readDemo, consumeDemo } from "../../lib/rate-limit";
import { VOICE_SYSTEM_PROMPT } from "../../prompts/system";
import {
  runDeterministicChecks,
  computeDeterministicSubScores,
} from "../../lib/deterministic-checks";
import {
  renderDocToMarkdown,
  type VoiceDoc,
} from "../../lib/voice-doc-schema";
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
  voiceDocMarkdown: string,
  draft: string
): Promise<LlmVoiceJudgment> {
  const userInput = `BRAND VOICE DOC:\n\n${voiceDocMarkdown}\n\n---\n\nDRAFT TO CHECK:\n\n${draft}`;
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

function avg(xs: number[]): number {
  return Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
}

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

function composeReason(
  llmRuns: LlmVoiceJudgment[],
  deterministicFlagCount: number,
  band: VoiceBand
): string {
  const llmReasonsTone = llmRuns.map((r) => r.tone_reason).filter(Boolean);
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

/** Basic shape validation on the incoming VoiceDoc. */
function validateVoiceDoc(input: unknown): VoiceDoc | string {
  if (!input || typeof input !== "object") {
    return "voiceDoc must be a structured object (see /brand-voice-template.md).";
  }
  const doc = input as Partial<VoiceDoc>;
  if (!doc.client_name || typeof doc.client_name !== "string") {
    return "voiceDoc.client_name is required.";
  }
  if (!Array.isArray(doc.banned_words)) {
    return "voiceDoc.banned_words must be an array.";
  }
  if (!Array.isArray(doc.voice_on_examples)) {
    return "voiceDoc.voice_on_examples must be an array.";
  }
  if (!Array.isArray(doc.voice_off_examples)) {
    return "voiceDoc.voice_off_examples must be an array.";
  }
  if (!Array.isArray(doc.required_terms)) {
    return "voiceDoc.required_terms must be an array.";
  }
  if (!Array.isArray(doc.examples_gallery)) {
    return "voiceDoc.examples_gallery must be an array.";
  }
  if (!doc.punctuation || typeof doc.punctuation !== "object") {
    return "voiceDoc.punctuation is required.";
  }
  return doc as VoiceDoc;
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

  // Step 2 — validate input. Body shape: { voiceDoc: VoiceDoc, draft: string }
  let body: { voiceDoc?: unknown; draft?: unknown };
  try {
    body = await request.json();
  } catch {
    return json<VoiceResult>({
      ok: false,
      error: "invalid_input",
      message: "Body must be JSON with `voiceDoc` (object) and `draft` (string).",
    });
  }
  const validated = validateVoiceDoc(body.voiceDoc);
  if (typeof validated === "string") {
    return json<VoiceResult>({
      ok: false,
      error: "invalid_input",
      message: validated,
    });
  }
  const voiceDoc = validated;
  const draft = typeof body.draft === "string" ? body.draft.trim() : "";
  if (!draft) {
    return json<VoiceResult>({
      ok: false,
      error: "invalid_input",
      message: "Paste a draft to check.",
    });
  }
  if (draft.length > 6000) {
    return json<VoiceResult>({
      ok: false,
      error: "invalid_input",
      message: "Draft too long. Maximum 6000 characters.",
    });
  }

  // Step 3 — deterministic pre-pass against the typed doc.
  const deterministicFlags = runDeterministicChecks(draft, voiceDoc);
  const detSubScores = computeDeterministicSubScores(
    voiceDoc,
    deterministicFlags
  );

  // Step 4 — render markdown for the LLM (keeps the existing system prompt
  // and its calibration examples unchanged), then N=2 calls in parallel.
  const voiceDocMarkdown = renderDocToMarkdown(voiceDoc);
  if (voiceDocMarkdown.length > 12000) {
    return json<VoiceResult>({
      ok: false,
      error: "invalid_input",
      message: "Serialized voice doc exceeds 12000 chars. Trim some examples.",
    });
  }

  let llmRuns: LlmVoiceJudgment[];
  try {
    llmRuns = await Promise.all([
      callLlmOnce(voiceDocMarkdown, draft),
      callLlmOnce(voiceDocMarkdown, draft),
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = msg.includes("ANTHROPIC_API_KEY")
      ? "missing_api_key"
      : "anthropic_error";
    return json<VoiceResult>({ ok: false, error: code, message: msg });
  }

  // Step 5 — tie-break if the two initial runs land in non-adjacent bands.
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
      const tieBreak = await callLlmOnce(voiceDocMarkdown, draft);
      llmRuns.push(tieBreak);
    } catch {
      // Tie-break failed — proceed with the two we have. Confidence stays low.
    }
  }

  // Step 6 — aggregate the final score.
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

  let confidence: "high" | "medium" | "low";
  if (initialDistance === 0) confidence = "high";
  else if (initialDistance === 1) confidence = "medium";
  else confidence = "low";

  // Step 7 — merge flags (deterministic + de-duped LLM, with LLM flags whose
  // phrase already appears in the deterministic set dropped to avoid
  // double-citation).
  const detPhrases = new Set(
    deterministicFlags.map((f) => f.phrase.toLowerCase().trim())
  );
  const llmFlags = dedupeLlmFlags(
    llmRuns
      .flatMap((r) => r.flags)
      .filter((f) => !detPhrases.has(f.phrase.toLowerCase().trim()))
  );
  const mergedFlags = [...deterministicFlags, ...llmFlags];

  // Step 8 — pick the rewrite from the run closest to the averaged final score.
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
