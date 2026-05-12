export interface VoiceFlag {
  /** Exact substring from the draft. Client finds first occurrence to highlight. */
  phrase: string;
  /** A single sentence quoted from the voice doc, in quotes. */
  rule_cited: string;
  /** Suggested rewrite of just this phrase. */
  suggested_rewrite: string;
}

export interface VoiceResult {
  /** 0-100 score. */
  score: number;
  /** One-sentence explanation of the score. */
  score_reason: string;
  /** Flagged phrases — empty if the draft is on-brand. */
  flags: VoiceFlag[];
  /** Full draft rewritten to be on-brand. */
  rewritten_draft: string;
}
