/**
 * Which kind of rule the flag violates. Drives the category badge on each
 * flag card. The three deterministic checks set this precisely. LLM flags all
 * use "voice": the tone-vs-cadence line is too blurry to label reliably per
 * flag, so the badge stays honest while the tone/cadence split lives in the
 * sub-scores instead.
 */
export type VoiceFlagCategory =
  | "banned_word"
  | "punctuation"
  | "terminology"
  | "voice";

export interface VoiceFlag {
  /** Which rule kind this violates — rendered as the card's category badge. */
  category: VoiceFlagCategory;
  /** Exact substring from the draft. Client finds first occurrence to highlight. */
  phrase: string;
  /**
   * The "why" shown under the phrase. No longer wrapped in quotes by the UI —
   * the category badge carries the rule kind, so this is a plain reason.
   * May be empty for deterministic flags where the badge + phrase + suggested
   * rewrite already tell the whole story (e.g. a terminology swap with no note);
   * the UI hides the line when it's empty.
   */
  rule_cited: string;
  /**
   * Suggested rewrite of just this phrase. Optional: omitted when there's no
   * substantive suggestion to make — e.g. banned words (the rule already says
   * "remove or replace") and exclamation overuse (the rule says how many are
   * allowed). The UI hides the "Try" block when this is absent rather than
   * showing a meaningless placeholder. Always present for required-term swaps
   * (the right term) and LLM tone/cadence flags (a real rewrite).
   */
  suggested_rewrite?: string;
}

export type VoiceBand =
  | "on-brand"
  | "mostly-on-brand"
  | "drifting"
  | "off-brand"
  | "rewrite-needed";

export interface VoiceSubScores {
  /** Deterministic — banned words + required-term swaps. 0–100. */
  vocabulary: number;
  /** Deterministic — banned punctuation patterns. 0–100. */
  punctuation: number;
  /** LLM — tone match (warm/calm/authoritative/etc). 0–100. */
  tone: number;
  /** LLM — cadence, sentence length, lecture-vs-converse, sensory-vs-claim. 0–100. */
  cadence: number;
}

/**
 * What the LLM returns per call. The API layer wraps N=2 of these into the
 * final VoiceResult below.
 */
export interface LlmVoiceJudgment {
  /** 1–5 pairwise score: how close to voice-on examples vs voice-off. */
  tone_score_1_5: number;
  /** 1–5 pairwise score for cadence. */
  cadence_score_1_5: number;
  /** Short rationale for tone score (one sentence). */
  tone_reason: string;
  /** Short rationale for cadence score (one sentence). */
  cadence_reason: string;
  /** Tone/cadence flags only — vocab/punctuation are deterministic. */
  flags: VoiceFlag[];
  /** Full draft rewritten to be on-brand. */
  rewritten_draft: string;
}

export interface VoiceResult {
  /** Weighted 0–100 composite. */
  composite_score: number;
  /** Band the composite falls into. UI shows the band as the headline. */
  band: VoiceBand;
  /** Human-readable label for the band. */
  band_label: string;
  /** Per-criterion sub-scores. */
  sub_scores: VoiceSubScores;
  /** One-sentence explanation of the result. */
  score_reason: string;
  /** All flags merged: deterministic + LLM (de-duplicated). */
  flags: VoiceFlag[];
  /** Full draft rewritten to be on-brand. */
  rewritten_draft: string;
  /**
   * Confidence in the LLM-side sub-scores based on N=2 agreement.
   * - 'high': both runs agreed on band
   * - 'medium': bands differed by 1 → tie-break call settled it
   * - 'low': bands diverged significantly even after tie-break
   */
  confidence: "high" | "medium" | "low";
}

/** Composite weights. Sum to 1.0. */
export const SUB_SCORE_WEIGHTS = {
  vocabulary: 0.3,
  punctuation: 0.15,
  tone: 0.3,
  cadence: 0.25,
} as const;

export function bandFor(composite: number): { band: VoiceBand; label: string } {
  if (composite >= 90) return { band: "on-brand", label: "On brand" };
  if (composite >= 75) return { band: "mostly-on-brand", label: "Mostly on brand" };
  if (composite >= 55) return { band: "drifting", label: "Drifting" };
  if (composite >= 35) return { band: "off-brand", label: "Off brand" };
  return { band: "rewrite-needed", label: "Heavy rewrite needed" };
}

export function compositeFrom(sub: VoiceSubScores): number {
  const w = SUB_SCORE_WEIGHTS;
  return Math.round(
    sub.vocabulary * w.vocabulary +
      sub.punctuation * w.punctuation +
      sub.tone * w.tone +
      sub.cadence * w.cadence
  );
}

/** Map a 1–5 pairwise score to 0–100 for compositing. */
export function pairwiseToScore(pairwise: number): number {
  // 1 → 10, 2 → 30, 3 → 55, 4 → 80, 5 → 98
  const map: Record<number, number> = { 1: 10, 2: 30, 3: 55, 4: 80, 5: 98 };
  const clamped = Math.max(1, Math.min(5, Math.round(pairwise)));
  return map[clamped];
}
