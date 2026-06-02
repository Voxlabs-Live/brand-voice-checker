/**
 * Structured voice doc schema — the typed shape that replaces the
 * free-form markdown textarea as the source of truth for client voice docs.
 *
 * Why typed:
 * - The deterministic scoring pre-pass reads directly from this shape; no
 *   regex parsing of markdown, no parser edge cases.
 * - localStorage persistence and form validation both target the same fields,
 *   so what gets saved is exactly what gets scored.
 * - The LLM prompt receives a markdown serialization (renderDocToMarkdown
 *   below) so the existing system prompt is unchanged.
 *
 * Sections mirror public/brand-voice-template.md 1:1.
 */

export interface BannedWord {
  word: string;
  /** Optional one-liner reason. Surfaces in the cited rule when flagged. */
  reason?: string;
}

export interface VoiceOffExample {
  example: string;
  /** Why this draft reads off-brand — required for the LLM pairwise anchor. */
  why_wrong: string;
}

export interface RequiredTerm {
  /** The word the brand uses. */
  use: string;
  /** The word the brand avoids. Tool flags any draft using this term. */
  not: string;
  /** Optional context (e.g., "in feed copy", "in clinical posts"). */
  note?: string;
}

export interface Exception {
  exception: string;
  when: string;
}

/** Enumerated punctuation policies. */
export type ExclamationPolicy = "never" | "at_most_one" | "freely";
export type EmojiPolicy = "never" | "sparingly" | "freely";

export interface PunctuationRules {
  exclamation: ExclamationPolicy;
  /** Free-text — em-dashes are usually descriptive ("yes, sparingly"). */
  em_dash?: string;
  ellipsis?: string;
  emoji: EmojiPolicy;
}

export interface CtaRules {
  preferred?: string[];
  banned?: string[];
  /** "eager / measured / direct" or similar. */
  tone?: string;
}

export interface VoiceDoc {
  /** Stable id used for storage and the picker dropdown. */
  id: string;
  /** Client name, e.g. "Aurelia Lashes". Also serves as display label. */
  client_name: string;
  /** Optional category for organization. */
  vertical?: string;

  /** §1 — three tone words that pull against each other. */
  tone_words: [string, string, string];

  /** §2 — banned words and phrases with reasons. Minimum 3 for a usable doc. */
  banned_words: BannedWord[];

  /** §3 — required cadence rules as free-text bullets. */
  cadence_rules: string[];

  /** §4 — voice-on examples (paragraphs). Minimum 3 for pairwise anchoring. */
  voice_on_examples: string[];

  /** §5 — voice-off examples with explanations. Minimum 2. */
  voice_off_examples: VoiceOffExample[];

  /** §6 — punctuation rules (enumerated where possible). */
  punctuation: PunctuationRules;

  /** §7 — CTA voice rules. Optional. */
  cta: CtaRules;

  /** §8 — required-term swaps for terminology consistency. */
  required_terms: RequiredTerm[];

  /** §9 — exceptions to the brand's own rules. Optional. */
  exceptions?: Exception[];

  /** §10 — example gallery. Minimum 5 for a usable doc. */
  examples_gallery: string[];

  /** Set when persisted / updated. ISO string. */
  updated_at?: string;
}

/** Create an empty doc the form can populate. */
export function emptyVoiceDoc(): VoiceDoc {
  return {
    id: crypto.randomUUID(),
    client_name: "",
    vertical: "",
    tone_words: ["", "", ""],
    banned_words: [],
    cadence_rules: [],
    voice_on_examples: [],
    voice_off_examples: [],
    punctuation: {
      exclamation: "at_most_one",
      em_dash: "",
      ellipsis: "",
      emoji: "sparingly",
    },
    cta: { preferred: [], banned: [], tone: "" },
    required_terms: [],
    exceptions: [],
    examples_gallery: [],
  };
}

/** Minimum content thresholds — drives form validation and strength scoring. */
export const MIN_CONTENT = {
  banned_words: 3,
  voice_on_examples: 3,
  voice_off_examples: 2,
  examples_gallery: 5,
} as const;

/** Convert an exclamation policy to a human-readable rule line. */
export function exclamationRuleText(policy: ExclamationPolicy): string {
  switch (policy) {
    case "never":
      return "Exclamation marks: never. No exceptions.";
    case "at_most_one":
      return "Exclamation marks: at most one per post. Never multiple in a row.";
    case "freely":
      return "Exclamation marks: used freely.";
  }
}

export function emojiRuleText(policy: EmojiPolicy): string {
  switch (policy) {
    case "never":
      return "Emojis: never.";
    case "sparingly":
      return "Emojis: sparingly.";
    case "freely":
      return "Emojis: used freely.";
  }
}

/**
 * Serialize a structured voice doc to the same 10-section markdown layout
 * the LLM was trained on (with the calibration examples in the system
 * prompt). Keeps the prompt unchanged across the schema migration.
 */
export function renderDocToMarkdown(doc: VoiceDoc): string {
  const lines: string[] = [];
  lines.push(`# Voice doc — ${doc.client_name || "(untitled)"}`);
  lines.push("");

  lines.push("## 1. Three tone words");
  doc.tone_words.forEach((t, i) => {
    lines.push(`- Tone ${i + 1}: ${t || "—"}`);
  });
  lines.push("");

  lines.push("## 2. Banned words and phrases");
  if (doc.banned_words.length === 0) {
    lines.push("- (none specified)");
  } else {
    for (const bw of doc.banned_words) {
      lines.push(
        bw.reason ? `- \`${bw.word}\` — ${bw.reason}` : `- \`${bw.word}\``
      );
    }
  }
  lines.push("");

  lines.push("## 3. Required cadence rules");
  if (doc.cadence_rules.length === 0) {
    lines.push("- (none specified)");
  } else {
    for (const r of doc.cadence_rules) lines.push(`- ${r}`);
  }
  lines.push("");

  lines.push("## 4. Voice-on examples");
  if (doc.voice_on_examples.length === 0) {
    lines.push("> (none specified)");
  } else {
    for (const ex of doc.voice_on_examples) {
      lines.push(`> ${ex}`);
      lines.push("");
    }
  }

  lines.push("## 5. Voice-off examples");
  if (doc.voice_off_examples.length === 0) {
    lines.push("> (none specified)");
  } else {
    for (const off of doc.voice_off_examples) {
      lines.push(`> ${off.example} — (wrong because: ${off.why_wrong})`);
      lines.push("");
    }
  }

  lines.push("## 6. Punctuation rules");
  lines.push(`- ${exclamationRuleText(doc.punctuation.exclamation)}`);
  if (doc.punctuation.em_dash) lines.push(`- Em-dashes: ${doc.punctuation.em_dash}`);
  if (doc.punctuation.ellipsis) lines.push(`- Ellipses: ${doc.punctuation.ellipsis}`);
  lines.push(`- ${emojiRuleText(doc.punctuation.emoji)}`);
  lines.push("");

  lines.push("## 7. CTA voice rules");
  if (doc.cta?.preferred && doc.cta.preferred.length > 0) {
    lines.push(
      `- Preferred CTA phrases: ${doc.cta.preferred.map((p) => `"${p}"`).join(", ")}.`
    );
  }
  if (doc.cta?.banned && doc.cta.banned.length > 0) {
    lines.push(
      `- Banned CTA phrases: ${doc.cta.banned.map((p) => `"${p}"`).join(", ")}.`
    );
  }
  if (doc.cta?.tone) lines.push(`- Tone of the ask: ${doc.cta.tone}.`);
  lines.push("");

  lines.push("## 8. Industry-specific terminology");
  if (doc.required_terms.length === 0) {
    lines.push("- (none specified)");
  } else {
    for (const t of doc.required_terms) {
      const note = t.note ? ` (${t.note})` : "";
      lines.push(`- Use "${t.use}", not "${t.not}"${note}.`);
    }
  }
  lines.push("");

  lines.push("## 9. Client-specific exceptions");
  const exceptions = doc.exceptions ?? [];
  if (exceptions.length === 0) {
    lines.push("- (none specified)");
  } else {
    for (const e of exceptions) {
      lines.push(`- Exception: ${e.exception}`);
      lines.push(`  When: ${e.when}`);
    }
  }
  lines.push("");

  lines.push("## 10. Examples gallery");
  if (doc.examples_gallery.length === 0) {
    lines.push("> (none specified)");
  } else {
    for (const g of doc.examples_gallery) {
      lines.push(`> ${g}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}
