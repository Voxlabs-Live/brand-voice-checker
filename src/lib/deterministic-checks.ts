/**
 * Deterministic pre-pass for the Brand Voice Checker.
 *
 * Anything specifiable by a rule — banned words, banned punctuation patterns,
 * required-term swaps — runs here as a regex/substring check. 100% recall, no
 * model variance, instant, free.
 *
 * The LLM in src/prompts/system.ts handles only what resists formal
 * specification: tone match and cadence.
 *
 * Voice docs are expected to follow the 10-section structure from
 * public/brand-voice-template.md. The parser is lenient — missing or
 * malformed sections degrade gracefully (zero flags for that category).
 */
import type { VoiceFlag } from "./voice-types";

export interface BannedWordRule {
  /** The banned word/phrase as written in the doc. */
  word: string;
  /** The full rule line, quoted back as the flag citation. */
  rule: string;
}

export interface PunctuationRule {
  /** Regex that matches a violation in the draft. */
  pattern: RegExp;
  /** The full rule line, quoted back as the flag citation. */
  rule: string;
  /** Short suggested rewrite hint. */
  suggestion: string;
}

export interface RequiredTermRule {
  /** The wrong term used in the draft. */
  wrong: string;
  /** The right term per the voice doc. */
  right: string;
  /** The full rule line, quoted back as the flag citation. */
  rule: string;
}

export interface ParsedVoiceDoc {
  bannedWords: BannedWordRule[];
  punctuation: PunctuationRule[];
  requiredTerms: RequiredTermRule[];
}

/** Split a 10-section template doc into {sectionNumber → sectionBody}. */
function splitSections(doc: string): Map<number, string> {
  const out = new Map<number, string>();
  const re = /^##\s+(\d+)\.\s.*$/gm;
  const matches: Array<{ num: number; start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(doc))) {
    matches.push({ num: parseInt(m[1], 10), start: m.index, end: -1 });
  }
  for (let i = 0; i < matches.length; i++) {
    matches[i].end = i + 1 < matches.length ? matches[i + 1].start : doc.length;
    out.set(matches[i].num, doc.slice(matches[i].start, matches[i].end));
  }
  return out;
}

/** Parse §2 — lines of the form `- \`word\` — reason`. */
function parseBannedWords(section: string | undefined): BannedWordRule[] {
  if (!section) return [];
  const out: BannedWordRule[] = [];
  const lineRe = /^-\s*`([^`]+)`\s*(?:—\s*(.+))?$/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(section))) {
    const word = m[1].trim();
    const reason = m[2]?.trim();
    if (!word) continue;
    const rule = reason
      ? `Banned word: "${word}" — ${reason}.`
      : `Banned word: "${word}".`;
    out.push({ word, rule });
  }
  return out;
}

/**
 * Parse §6 — punctuation rules. We only enforce the two patterns that show
 * up across virtually every voice doc:
 *   - Exclamation marks: "never" → ban any !
 *   - Exclamation marks: "at most one ... never multiple" → ban !! or more
 * Everything else (em-dashes, ellipses, emojis) is harder to specify
 * unambiguously and gets handed to the LLM via tone/cadence.
 */
function parsePunctuation(section: string | undefined): PunctuationRule[] {
  if (!section) return [];
  const out: PunctuationRule[] = [];
  const exclamLine = section
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => /^-?\s*exclamation marks?:/i.test(l));
  if (!exclamLine) return out;

  const value = exclamLine.replace(/^-?\s*exclamation marks?:\s*/i, "");
  const ruleText = `Punctuation rule: ${exclamLine.replace(/^-\s*/, "")}`;

  if (/\bnever\b/i.test(value) && !/at most/i.test(value)) {
    out.push({
      pattern: /!+/g,
      rule: ruleText,
      suggestion: ".",
    });
  } else if (/at most one/i.test(value)) {
    out.push({
      pattern: /!{2,}/g,
      rule: ruleText,
      suggestion: ".",
    });
  }
  return out;
}

/**
 * Parse §8 — required-term swaps of the form `Use "X", not "Y"`.
 * Lines with multiple alternatives ("Use X or Y, not Z") are skipped for v1
 * to avoid false positives.
 */
function parseRequiredTerms(section: string | undefined): RequiredTermRule[] {
  if (!section) return [];
  const out: RequiredTermRule[] = [];
  const lineRe = /Use\s+"([^"]+)",?\s+not\s+"([^"]+)"/gi;
  for (const line of section.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let m: RegExpExecArray | null;
    while ((m = lineRe.exec(trimmed))) {
      const right = m[1].trim();
      const wrong = m[2].trim();
      if (!right || !wrong) continue;
      out.push({
        wrong,
        right,
        rule: `Terminology: ${trimmed.replace(/^-\s*/, "")}`,
      });
    }
    lineRe.lastIndex = 0;
  }
  return out;
}

export function parseVoiceDoc(doc: string): ParsedVoiceDoc {
  const sections = splitSections(doc);
  return {
    bannedWords: parseBannedWords(sections.get(2)),
    punctuation: parsePunctuation(sections.get(6)),
    requiredTerms: parseRequiredTerms(sections.get(8)),
  };
}

/**
 * Find the exact substring as it appears in the draft (preserving the
 * draft's casing) for a banned word or required-term match.
 */
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

/**
 * Run all deterministic checks against the draft. Returns flags in the same
 * shape the LLM returns, so the API layer can merge both flag sets without
 * shape-shifting.
 */
export function runDeterministicChecks(
  draft: string,
  parsed: ParsedVoiceDoc
): VoiceFlag[] {
  const flags: VoiceFlag[] = [];
  const seen = new Set<string>();

  // Banned words — word-boundary match, case-insensitive. Each unique
  // banned word flags once even if it appears multiple times (the UI
  // highlights all occurrences via substring search).
  for (const { word, rule } of parsed.bannedWords) {
    const phrase = findOriginalSubstring(draft, word);
    if (!phrase) continue;
    const key = `banned:${word.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    flags.push({
      phrase,
      rule_cited: rule,
      suggested_rewrite: "(remove or replace)",
    });
  }

  // Punctuation — regex match the offending characters directly. The matched
  // string IS the phrase (e.g. "!!!" or "!!").
  for (const { pattern, rule, suggestion } of parsed.punctuation) {
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(draft))) {
      const key = `punct:${m[0]}@${m.index}`;
      if (seen.has(key)) continue;
      seen.add(key);
      flags.push({
        phrase: m[0],
        rule_cited: rule,
        suggested_rewrite: suggestion,
      });
      if (m[0].length === 0) re.lastIndex++;
    }
  }

  // Required terms — flag the wrong term, suggest the right one.
  for (const { wrong, right, rule } of parsed.requiredTerms) {
    const phrase = findOriginalSubstring(draft, wrong);
    if (!phrase) continue;
    const key = `term:${wrong.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    flags.push({
      phrase,
      rule_cited: rule,
      suggested_rewrite: right,
    });
  }

  return flags;
}

/**
 * Compute deterministic sub-scores (0–100) from the deterministic flags.
 *
 * Flat per-flag deduction (not density-based). Density was unstable across
 * draft length — a single banned-punctuation pattern in a 20-word caption
 * shouldn't crater the punctuation score to 0, but it did under per-100-word
 * scoring. Flat deductions degrade predictably:
 *   - 0 flags = 100
 *   - 1 flag = high-double-digits (clear but recoverable)
 *   - 4+ flags = 0 (draft is unsalvageable on this dimension)
 *
 * If a category has no rules in the doc, the sub-score is 100 — we don't
 * penalize the brand for not writing rules they don't need.
 */
const VOCAB_DEDUCTION_PER_FLAG = 25;
const PUNCT_DEDUCTION_PER_FLAG = 35;

export function computeDeterministicSubScores(
  draft: string,
  parsed: ParsedVoiceDoc,
  flags: VoiceFlag[]
): { vocabulary: number; punctuation: number } {
  const bannedWordSet = new Set(
    parsed.bannedWords.map((b) => b.word.toLowerCase())
  );
  const requiredTermSet = new Set(
    parsed.requiredTerms.map((t) => t.wrong.toLowerCase())
  );
  const punctRules = parsed.punctuation;

  let vocabFlagCount = 0;
  let punctFlagCount = 0;

  for (const f of flags) {
    const phraseLower = f.phrase.toLowerCase();
    if (bannedWordSet.has(phraseLower) || requiredTermSet.has(phraseLower)) {
      vocabFlagCount++;
    } else if (punctRules.length > 0 && /^[!?.…]+$/.test(f.phrase)) {
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

  return {
    vocabulary:
      parsed.bannedWords.length + parsed.requiredTerms.length === 0
        ? 100
        : vocabulary,
    punctuation: parsed.punctuation.length === 0 ? 100 : punctuation,
  };
}
