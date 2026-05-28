/**
 * Section detection for uploaded voice docs.
 *
 * Real-world voice docs come in many shapes: `## 2. Banned words`,
 * `**Banned words**`, `Banned Words:`, or plain prose. The detector tries
 * a series of regex variants against each section's known aliases and
 * returns a map of section number → body text. Sections it can't find are
 * left null so the LLM fallback can take a pass at the remaining text.
 *
 * Detection rate (sections_found / 10) drives the import endpoint's fallback
 * decision: if < 50% the doc is unstructured enough to warrant LLM
 * extraction over the raw text.
 */

/**
 * Aliases for each of the 10 template sections. Lowercased, no punctuation —
 * the detector normalizes headings before matching.
 */
const SECTION_ALIASES: Record<number, string[]> = {
  1: ["three tone words", "tone words", "voice tone", "tone"],
  2: ["banned words and phrases", "banned words", "banned phrases", "do not use", "donts", "avoid"],
  3: ["required cadence rules", "cadence rules", "cadence", "rhythm", "sentence structure"],
  4: ["voice-on examples", "voice on examples", "voice-on", "on-brand examples", "voice on"],
  5: ["voice-off examples", "voice off examples", "voice-off", "off-brand examples", "voice off"],
  6: ["punctuation rules", "punctuation"],
  7: ["cta voice rules", "cta rules", "cta", "calls to action", "call to action"],
  8: ["industry-specific terminology", "industry terminology", "terminology", "specific terms", "vocabulary"],
  9: ["client-specific exceptions", "exceptions", "client exceptions"],
  10: ["examples gallery", "gallery", "examples", "sample posts", "example posts"],
};

export interface SectionMap {
  /** section number → text body (or null if not found). */
  sections: Record<number, string | null>;
  /** Count of sections found (0-10). */
  foundCount: number;
  /** Whether enough sections were detected to skip LLM fallback (>=50%). */
  detectionPassed: boolean;
}

export function detectSections(rawText: string): SectionMap {
  const headings = findHeadings(rawText);
  const sections: Record<number, string | null> = {};
  for (let i = 1; i <= 10; i++) sections[i] = null;

  // Map each heading to a section number based on its text content.
  const tagged = headings.map((h) => ({
    ...h,
    section: matchSectionNumber(h.text),
  }));

  // For each detected section, body = text between this heading and the next.
  for (let i = 0; i < tagged.length; i++) {
    const h = tagged[i];
    if (h.section === null) continue;
    const start = h.bodyStart;
    const end = i + 1 < tagged.length ? tagged[i + 1].start : rawText.length;
    const body = rawText.slice(start, end).trim();
    // If we already have content for this section (multiple headings with
    // the same alias), keep the longer one.
    if (!sections[h.section] || body.length > (sections[h.section]?.length ?? 0)) {
      sections[h.section] = body;
    }
  }

  const foundCount = Object.values(sections).filter((v) => v !== null).length;
  return {
    sections,
    foundCount,
    detectionPassed: foundCount >= 5,
  };
}

interface Heading {
  text: string;       // normalized heading text
  start: number;      // index of heading start in rawText
  bodyStart: number;  // index where the section body starts (after the heading line)
}

/**
 * Find candidate headings in the raw text. Recognizes:
 * - Markdown ATX: `## 2. Banned words`, `# Banned words`
 * - Numbered prefix on its own line: `2. Banned Words`, `Section 2: Banned Words`
 * - Bold marker: `**Banned Words**`
 * - Trailing colon: `Banned Words:`
 *
 * Returns headings in document order with body-start offsets.
 */
function findHeadings(text: string): Heading[] {
  const headings: Heading[] = [];
  const lines = text.split(/\r?\n/);
  let cursor = 0;

  const headingPatterns: RegExp[] = [
    /^#{1,4}\s+(?:\d+\.\s*)?(.+?)\s*$/, // ## 2. Banned Words  or  ## Banned Words
    /^\*\*([^*]+)\*\*\s*$/, // **Banned Words**
    /^(?:section\s+)?(\d+)[.:]\s*(.+?)\s*$/i, // 2. Banned Words / Section 2: Banned Words
    /^([A-Z][A-Za-z0-9 ,'\-/]+):\s*$/, // Banned Words:
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed) {
      for (const re of headingPatterns) {
        const m = trimmed.match(re);
        if (m) {
          const headingText = (m[2] ?? m[1] ?? "").trim();
          if (headingText && headingText.length < 80) {
            headings.push({
              text: normalize(headingText),
              start: cursor + line.indexOf(trimmed),
              bodyStart: cursor + line.length + 1, // skip the newline
            });
          }
          break;
        }
      }
    }
    cursor += line.length + 1; // +1 for newline
  }
  return headings;
}

/** Lowercase, strip punctuation, collapse whitespace. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.:#*_~`"'()\[\]{}]/g, "")
    .replace(/\s+/g, " ")
    .replace(/§/g, "")
    .trim();
}

/** Match a normalized heading text to a section number (1-10) or null. */
function matchSectionNumber(headingText: string): number | null {
  // Direct numeric prefix wins ("§2 banned words" → 2).
  const numMatch = headingText.match(/^(\d+)\b/);
  if (numMatch) {
    const n = parseInt(numMatch[1], 10);
    if (n >= 1 && n <= 10) {
      // Sanity-check that the remainder loosely matches the alias list.
      const remainder = headingText.replace(/^\d+\s*/, "").trim();
      if (!remainder) return n; // bare "2." with no text after — trust the number
      for (const alias of SECTION_ALIASES[n]) {
        if (remainder.includes(alias) || alias.includes(remainder)) return n;
      }
      // Number is present but heading doesn't match its expected aliases.
      // Trust the alias check below over the number.
    }
  }
  // Alias-only matching.
  for (let n = 1; n <= 10; n++) {
    for (const alias of SECTION_ALIASES[n]) {
      if (headingText.includes(alias)) return n;
    }
  }
  return null;
}
