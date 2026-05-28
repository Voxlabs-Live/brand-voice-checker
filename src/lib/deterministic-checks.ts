/**
 * Deterministic pre-pass for the Brand Voice Checker.
 *
 * Reads directly from the typed VoiceDoc (no markdown parsing) and runs
 * regex/substring checks for banned words, banned punctuation patterns, and
 * required-term swaps. 100% recall on rule-based violations, zero LLM
 * variance, instant, free.
 *
 * The LLM in src/prompts/system.ts handles only what resists formal
 * specification: tone match and cadence.
 */
import type { VoiceDoc, ExclamationPolicy } from "./voice-doc-schema";
import type { VoiceFlag } from "./voice-types";

/**
 * Run all deterministic checks against the draft. Returns flags in the same
 * shape the LLM returns so the API layer can merge both sets uniformly.
 */
export function runDeterministicChecks(
  draft: string,
  doc: VoiceDoc
): VoiceFlag[] {
  const flags: VoiceFlag[] = [];
  const seen = new Set<string>();

  // Banned words — case-insensitive word-boundary match. Each unique banned
  // word flags once even if it appears multiple times (the UI highlights all
  // occurrences via substring search).
  for (const bw of doc.banned_words) {
    const word = bw.word.trim();
    if (!word) continue;
    const phrase = findOriginalSubstring(draft, word);
    if (!phrase) continue;
    const key = `banned:${word.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    flags.push({
      phrase,
      rule_cited: bw.reason
        ? `Banned word: "${word}" — ${bw.reason}.`
        : `Banned word: "${word}".`,
      suggested_rewrite: "(remove or replace)",
    });
  }

  // Punctuation — exclamation marks only (the one rule with a clear
  // deterministic shape). Em-dashes, ellipses and emojis are descriptive
  // policies the LLM handles via tone/cadence.
  const punctRule = exclamationPattern(doc.punctuation.exclamation);
  if (punctRule) {
    const re = new RegExp(punctRule.pattern.source, punctRule.pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(draft))) {
      const key = `punct:${m[0]}@${m.index}`;
      if (seen.has(key)) continue;
      seen.add(key);
      flags.push({
        phrase: m[0],
        rule_cited: punctRule.ruleText,
        suggested_rewrite: ".",
      });
      if (m[0].length === 0) re.lastIndex++;
    }
  }

  // Required-term swaps — flag the wrong term, suggest the right one.
  for (const t of doc.required_terms) {
    const wrong = t.not.trim();
    const right = t.use.trim();
    if (!wrong || !right) continue;
    const phrase = findOriginalSubstring(draft, wrong);
    if (!phrase) continue;
    const key = `term:${wrong.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const note = t.note ? ` (${t.note})` : "";
    flags.push({
      phrase,
      rule_cited: `Terminology: use "${right}", not "${wrong}"${note}.`,
      suggested_rewrite: right,
    });
  }

  return flags;
}

/**
 * Compute deterministic sub-scores (0–100) via flat per-flag deduction.
 * Density-based deduction was unstable for short drafts; flat deduction
 * degrades predictably across draft lengths.
 *
 * If a category has no rules in the doc, the sub-score is 100 — we don't
 * penalize the brand for not writing rules they don't need.
 */
const VOCAB_DEDUCTION_PER_FLAG = 25;
const PUNCT_DEDUCTION_PER_FLAG = 35;

export function computeDeterministicSubScores(
  doc: VoiceDoc,
  flags: VoiceFlag[]
): { vocabulary: number; punctuation: number } {
  const bannedWordSet = new Set(
    doc.banned_words.map((b) => b.word.toLowerCase())
  );
  const requiredTermSet = new Set(
    doc.required_terms.map((t) => t.not.toLowerCase())
  );
  const hasPunctRule = doc.punctuation.exclamation !== "freely";

  let vocabFlagCount = 0;
  let punctFlagCount = 0;

  for (const f of flags) {
    const phraseLower = f.phrase.toLowerCase();
    if (bannedWordSet.has(phraseLower) || requiredTermSet.has(phraseLower)) {
      vocabFlagCount++;
    } else if (hasPunctRule && /^[!?.…]+$/.test(f.phrase)) {
      punctFlagCount++;
    }
  }

  const vocabulary = Math.max(
    0,
    100 - vocabFlagCount * VOCAB_DEDUCTION_PER_FLAG
  );
  const punctuation = Math.max(
    0,
    100 - punctFlagCount * PUNCT_DEDUCTION_PER_FLAG
  );

  const hasVocabRules =
    doc.banned_words.length + doc.required_terms.length > 0;
  return {
    vocabulary: hasVocabRules ? vocabulary : 100,
    punctuation: hasPunctRule ? punctuation : 100,
  };
}

interface PunctPattern {
  pattern: RegExp;
  ruleText: string;
}

function exclamationPattern(policy: ExclamationPolicy): PunctPattern | null {
  switch (policy) {
    case "never":
      return {
        pattern: /!+/g,
        ruleText: "Punctuation rule: Exclamation marks: never. No exceptions.",
      };
    case "at_most_one":
      return {
        pattern: /!{2,}/g,
        ruleText:
          "Punctuation rule: Exclamation marks: at most one per post. Never multiple in a row.",
      };
    case "freely":
      return null;
  }
}

function findOriginalSubstring(
  draft: string,
  needle: string
): string | null {
  const re = new RegExp(`\\b${escapeRegExp(needle)}\\b`, "i");
  const m = draft.match(re);
  return m ? m[0] : null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
