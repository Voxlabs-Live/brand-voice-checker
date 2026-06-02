/**
 * Deterministic field extraction from detected section text.
 *
 * Given the section map produced by section-detector, pull structured fields
 * out using regex patterns. Anything that can be specified — backtick-quoted
 * banned words, `Use "X", not "Y"` swaps, blockquote examples, enumerated
 * punctuation policies — comes out here without an LLM call.
 *
 * Fields the regex can't extract (or can extract only partially) are left
 * undefined in the partial doc, so the LLM-critique step in
 * src/prompts/import-critique.ts can fill the gaps.
 */
import type { SectionMap } from "./section-detector";
import {
  emptyVoiceDoc,
  type VoiceDoc,
  type BannedWord,
  type RequiredTerm,
  type VoiceOffExample,
  type ExclamationPolicy,
  type EmojiPolicy,
} from "./voice-doc-schema";

/** Result of deterministic extraction — a partial VoiceDoc plus per-field confidence. */
export interface FieldExtractionResult {
  doc: VoiceDoc;
  /** Which sections had any deterministic content extracted. */
  filled: Set<number>;
}

export function extractFields(sections: SectionMap): FieldExtractionResult {
  const doc = emptyVoiceDoc();
  const filled = new Set<number>();

  // §1 — tone words (comma/slash/dash-separated, or numbered list).
  const s1 = sections.sections[1];
  if (s1) {
    const tone = extractToneWords(s1);
    if (tone.length > 0) {
      doc.tone_words = [tone[0] ?? "", tone[1] ?? "", tone[2] ?? ""] as [string, string, string];
      filled.add(1);
    }
  }

  // §2 — banned words.
  const s2 = sections.sections[2];
  if (s2) {
    const bw = extractBannedWords(s2);
    if (bw.length > 0) {
      doc.banned_words = bw;
      filled.add(2);
    }
  }

  // §3 — cadence rules. Bullet lines from the section.
  const s3 = sections.sections[3];
  if (s3) {
    const rules = extractBulletLines(s3);
    if (rules.length > 0) {
      doc.cadence_rules = rules;
      filled.add(3);
    }
  }

  // §4 — voice-on examples. Blockquote-prefixed paragraphs (or bullet list).
  const s4 = sections.sections[4];
  if (s4) {
    const ex = extractBlockquotes(s4);
    if (ex.length > 0) {
      doc.voice_on_examples = ex;
      filled.add(4);
    }
  }

  // §5 — voice-off examples with "wrong because" tail.
  const s5 = sections.sections[5];
  if (s5) {
    const ex = extractVoiceOff(s5);
    if (ex.length > 0) {
      doc.voice_off_examples = ex;
      filled.add(5);
    }
  }

  // §6 — punctuation rules.
  const s6 = sections.sections[6];
  if (s6) {
    const punct = extractPunctuation(s6);
    if (punct) {
      doc.punctuation = punct;
      filled.add(6);
    }
  }

  // §7 — CTA rules (partial extraction; LLM often needs to fill this).
  const s7 = sections.sections[7];
  if (s7) {
    const cta = extractCta(s7);
    if (cta) {
      doc.cta = cta;
      filled.add(7);
    }
  }

  // §8 — required terminology swaps.
  const s8 = sections.sections[8];
  if (s8) {
    const terms = extractRequiredTerms(s8);
    if (terms.length > 0) {
      doc.required_terms = terms;
      filled.add(8);
    }
  }

  // §10 — examples gallery (blockquotes or bullet list).
  const s10 = sections.sections[10];
  if (s10) {
    const gallery = extractBlockquotes(s10);
    if (gallery.length > 0) {
      doc.examples_gallery = gallery;
      filled.add(10);
    }
  }

  return { doc, filled };
}

// ─── Per-section extractors ─────────────────────────────────────────────────

function extractToneWords(text: string): string[] {
  // Three patterns: numbered list ("Tone 1: warm"), bullet list ("- warm"),
  // or inline ("warm, precise, sensory").
  const numbered = Array.from(
    text.matchAll(/tone\s*\d+\s*:\s*([^\n]+)/gi)
  ).map((m) => m[1].trim());
  if (numbered.length >= 2) return numbered.slice(0, 3);

  const bullets = extractBulletLines(text)
    .map((l) => l.replace(/^tone\s*\d+\s*:\s*/i, "").trim())
    .filter((l) => l && l.length < 40);
  if (bullets.length >= 2) return bullets.slice(0, 3);

  // Inline fallback. First strip a leading label like "Three words:", "Tone:"
  // or "Voice:" so it isn't captured as the first tone word.
  let firstLine = text.split(/\n/).find((l) => l.trim()) ?? "";
  const colon = firstLine.indexOf(":");
  if (colon > -1 && colon < 24 && /\b(?:words?|tone|voice)\b/i.test(firstLine.slice(0, colon))) {
    firstLine = firstLine.slice(colon + 1);
  }
  const inline = firstLine
    .split(/[,/·]| - | – /)
    .map((s) => s.trim().replace(/[.;]+$/, ""))
    .filter((s) => s && s.length < 30 && s.length > 1);
  return inline.slice(0, 3);
}

function extractBannedWords(text: string): BannedWord[] {
  const out: BannedWord[] = [];
  const seen = new Set<string>();

  // Pattern 1: `word` — reason   OR   `word`
  const backtickPattern = /`([^`]+)`\s*(?:[—–-]\s*([^\n]+))?/g;
  let m: RegExpExecArray | null;
  while ((m = backtickPattern.exec(text))) {
    const word = m[1].trim().toLowerCase();
    if (!word || seen.has(word)) continue;
    seen.add(word);
    out.push({ word: m[1].trim(), reason: m[2]?.trim() || undefined });
  }
  if (out.length > 0) return out;

  // Pattern 2: bullet line "- word — reason"  OR  "- "word" — reason"
  for (const line of extractBulletLines(text)) {
    const quoted = line.match(/^["'“”‘’]([^"'“”‘’]+)["'“”‘’]\s*(?:[—–-]\s*(.+))?$/);
    // ASCII hyphens require surrounding whitespace to separate word from reason;
    // unspaced `-` is treated as a compound-word character (e.g. `game-changer`).
    // Em/en dashes are unambiguous separators, so whitespace is optional.
    const dashSplit = line.match(/^([A-Za-z][A-Za-z0-9 '\-]*?)(?:\s+-\s+|\s*[—–]\s*)(.+)$/);
    let word = "";
    let reason: string | undefined;
    if (quoted) {
      word = quoted[1].trim();
      reason = quoted[2]?.trim();
    } else if (dashSplit) {
      word = dashSplit[1].trim();
      reason = dashSplit[2].trim();
    } else {
      // Just a bare word
      word = line.split(/[,;]/)[0].trim();
    }
    const key = word.toLowerCase();
    if (word && !seen.has(key) && word.length < 60) {
      seen.add(key);
      out.push({ word, reason });
    }
  }
  if (out.length > 0) return out;

  // Pattern 3: comma-separated inline list.
  const inline = text
    .replace(/banned\s+words?\s*[:\-–]\s*/i, "")
    .split(/[,;]/)
    .map((s) => s.trim().replace(/^["'`]|["'`]$/g, ""))
    .filter((s) => s && s.length < 40);
  for (const w of inline) {
    const key = w.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ word: w });
    }
  }
  return out;
}

function extractBulletLines(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(?:[-*•]\s+|\d+[.)]\s+)(.+)$/);
    if (m) {
      const content = m[1].trim();
      if (content) out.push(content);
    }
  }
  if (out.length > 0) return out;

  // Fallback for .pdf / .docx where list markers were lost in extraction.
  // Split the section on blank lines and treat each short, single-statement
  // block as a bullet. Constraints kept tight so body prose doesn't match:
  //   - need 3+ such blocks (a single short block is just a paragraph)
  //   - each candidate block ≤ 200 chars
  //   - each candidate block ≤ 2 sentence-ending punctuation marks
  //   - candidates must be ≥70% of the total blocks (mixed prose+lists not OK)
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.replace(/[ \t]+/g, " ").replace(/\n+/g, " ").trim())
    .filter((b) => b);
  if (blocks.length < 3) return out;
  const candidates = blocks.filter(
    (b) => b.length <= 200 && (b.match(/[.!?]/g)?.length ?? 0) <= 2,
  );
  if (candidates.length >= 3 && candidates.length >= blocks.length * 0.7) {
    return candidates;
  }
  return out;
}

function extractBlockquotes(text: string): string[] {
  // Pattern: lines starting with `>` (markdown blockquote). Fallback: each
  // bullet item as its own example.
  const out: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length > 0) {
      out.push(current.join(" ").trim());
      current = [];
    }
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const m = line.match(/^>\s?(.*)$/);
    if (m) {
      const content = m[1].trim();
      if (content) current.push(content);
      else flush(); // blank quote line separates paragraphs
    } else if (line.trim() === "") {
      flush();
    } else {
      // Not a blockquote line, but inside a section; only flush, don't include.
      flush();
    }
  }
  flush();
  if (out.length > 0) return out;

  // Fallback: bullet lines.
  return extractBulletLines(text).filter((l) => l.length > 12);
}

function extractVoiceOff(text: string): VoiceOffExample[] {
  // Try blockquote pattern: "> example — (wrong because: reason)"
  const out: VoiceOffExample[] = [];
  const quotes = extractBlockquotes(text);
  for (const q of quotes) {
    const m = q.match(/^(.*?)\s*[—–-]\s*\(?\s*wrong because\s*:?\s*([^)]+?)\s*\)?$/i);
    if (m) {
      out.push({ example: m[1].trim(), why_wrong: m[2].trim() });
    } else {
      // Example without explicit reason — keep it; LLM may fill the why_wrong.
      out.push({ example: q, why_wrong: "" });
    }
  }
  return out;
}

function extractPunctuation(
  text: string
): {
  exclamation: ExclamationPolicy;
  em_dash?: string;
  ellipsis?: string;
  emoji: EmojiPolicy;
} | null {
  const lower = text.toLowerCase();
  // Exclamation marks.
  let exclamation: ExclamationPolicy = "freely";
  const exclLine = findRuleLine(lower, ["exclamation"]);
  if (exclLine) {
    if (/\bnever\b/.test(exclLine) && !/at most/.test(exclLine)) {
      exclamation = "never";
    } else if (/at most one/.test(exclLine) || /one per post/.test(exclLine)) {
      exclamation = "at_most_one";
    } else if (/freely|unrestricted/.test(exclLine)) {
      exclamation = "freely";
    }
  }

  // Emojis.
  let emoji: EmojiPolicy = "freely";
  const emojiLine = findRuleLine(lower, ["emoji", "emojis"]);
  if (emojiLine) {
    if (/\bnever\b/.test(emojiLine)) emoji = "never";
    else if (/sparingly|rarely|once/.test(emojiLine)) emoji = "sparingly";
    else if (/freely|unrestricted/.test(emojiLine)) emoji = "freely";
  }

  // Em-dash + ellipsis are free-text; capture the trailing value if present.
  const em_dash = findRuleValue(text, ["em-dash", "em dash", "emdash"]);
  const ellipsis = findRuleValue(text, ["ellipsis", "ellipses"]);

  if (!exclLine && !emojiLine && !em_dash && !ellipsis) return null;
  return { exclamation, em_dash, ellipsis, emoji };
}

function extractCta(text: string): {
  preferred?: string[];
  banned?: string[];
  tone?: string;
} | null {
  const preferred: string[] = [];
  const banned: string[] = [];
  let tone: string | undefined;

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/preferred\s+cta/i.test(trimmed)) {
      const value = trimmed.replace(/.*?preferred\s+cta[^:]*:\s*/i, "");
      preferred.push(...splitQuotedList(value));
    } else if (/banned\s+cta/i.test(trimmed)) {
      const value = trimmed.replace(/.*?banned\s+cta[^:]*:\s*/i, "");
      banned.push(...splitQuotedList(value));
    } else if (/tone\s+of\s+the\s+ask/i.test(trimmed)) {
      tone = trimmed.replace(/.*?tone\s+of\s+the\s+ask\s*[:\-–]?\s*/i, "").trim() || undefined;
    }
  }
  if (preferred.length === 0 && banned.length === 0 && !tone) return null;
  return {
    preferred: preferred.length > 0 ? preferred : undefined,
    banned: banned.length > 0 ? banned : undefined,
    tone,
  };
}

function extractRequiredTerms(text: string): RequiredTerm[] {
  const out: RequiredTerm[] = [];
  // Match `Use "X", not "Y"` with double-quoted terms (the canonical template
  // format). Quotes act as unambiguous delimiters so the term captures don't
  // wander into adjacent text. Anything between the closing quote of "Y" and
  // the next period (excluding leading space and surrounding parens) becomes
  // the inline note. Examples it must catch:
  //   - Use "patients", not "clients".
  //   - Use "lashes", not "extensions" in feed copy.
  //   - Use "lot", not "batch" when referring to single-origin coffees.
  //   - Use "wear", not "rock" (wrong register).
  // Non-quoted variants (e.g. `we use guest, not customer`) are left for the
  // LLM fallback in the import endpoint — they're too ambiguous to parse
  // safely with a regex.
  const re = /use\s+"([^"]+)"\s*,?\s*not\s+"([^"]+)"\s*([^.\n]*?)\s*[.\n]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const use = m[1].trim();
    const not = m[2].trim();
    let note: string | undefined = m[3]?.trim() || undefined;
    if (note) {
      const stripped = note.replace(/^\(\s*|\s*\)$/g, "").trim();
      note = stripped || undefined;
    }
    if (use && not) out.push({ use, not, note });
  }
  return out;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function findRuleLine(lowerText: string, keys: string[]): string | null {
  for (const raw of lowerText.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    for (const key of keys) {
      if (line.includes(key)) return line;
    }
  }
  return null;
}

function findRuleValue(text: string, keys: string[]): string | undefined {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    for (const key of keys) {
      const re = new RegExp(`${key}\\s*[:\\-–]\\s*(.+)`, "i");
      const m = line.match(re);
      if (m) return m[1].trim();
    }
  }
  return undefined;
}

function splitQuotedList(value: string): string[] {
  const out: string[] = [];
  // Match double-quoted strings — these are the canonical container for CTA
  // phrases in voice docs. Apostrophes are NOT used as quote delimiters
  // because they appear inside content ("Don't miss out!") and would split
  // those phrases mid-word.
  const doubleQuoted = value.match(/"([^"]+)"/g);
  if (doubleQuoted) {
    for (const q of doubleQuoted) out.push(q.replace(/"/g, "").trim());
    return out;
  }
  // Same for single-quote-only formatting, but only when no embedded
  // apostrophes appear inside the captured tokens.
  const singleQuoted = value.match(/'([^']+)'/g);
  if (singleQuoted && singleQuoted.every((q) => !/\w'\w/.test(q.slice(1, -1)))) {
    for (const q of singleQuoted) out.push(q.replace(/'/g, "").trim());
    return out;
  }
  // Fall back to comma/semicolon-separated tokens.
  return value
    .split(/,|;/)
    .map((s) => s.trim().replace(/[."']$/, ""))
    .filter((s) => s);
}
