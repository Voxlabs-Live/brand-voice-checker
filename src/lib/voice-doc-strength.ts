/**
 * Deterministic voice doc strength scoring (0–10).
 *
 * The strength score is the user-facing measure of how rigorous their voice
 * doc is. Sharper doc → more reliable scoring downstream. The score is
 * computed from counts and content checks — never an LLM judgment — so
 * re-running it on the same doc always returns the same number.
 *
 * The strength score is independent of the draft-scoring composite. It tells
 * the buyer: "is your INPUT good enough?" not "is your DRAFT on-brand?"
 */
import {
  MIN_CONTENT,
  type VoiceDoc,
} from "./voice-doc-schema";

export type SectionStatus = "present" | "weak" | "missing";

export interface SectionAssessment {
  section: number;
  label: string;
  status: SectionStatus;
  /** Short reason — surfaces in the critique panel. */
  reason: string;
  /** Whether the deterministic-scoring pipeline depends on this section. */
  scoring_critical: boolean;
}

export interface DocStrength {
  /** 0–10 integer. */
  score: number;
  /** Per-section breakdown for the critique panel. */
  sections: SectionAssessment[];
  /** One-line summary suitable for the UI hero text. */
  summary: string;
}

/**
 * Weights for the 0–10 score. Total possible = 10. Each section contributes
 * its full weight if "present", half if "weak", zero if "missing".
 *
 * Rationale for the weighting:
 * - §2 banned words and §4 voice-on examples are the most-load-bearing
 *   inputs for the scoring pipeline, hence 2 points each.
 * - §10 gallery is the second-strongest pairwise anchor source — 2 points.
 * - §5 voice-off, §3 cadence, §6 punctuation, §8 terminology each carry 1.
 * - §1 tone words, §7 CTA, §9 exceptions are useful but not scoring-critical
 *   and aren't weighted (they show up in the per-section breakdown only).
 */
const WEIGHTS = {
  banned_words: 2,
  voice_on_examples: 2,
  voice_off_examples: 1,
  examples_gallery: 2,
  cadence_rules: 1,
  punctuation: 1,
  required_terms: 1,
} as const;

export function computeDocStrength(doc: VoiceDoc): DocStrength {
  const sections: SectionAssessment[] = [];

  // §1 — tone words. Not scored numerically (always present-ish), but
  // surfaced in the breakdown.
  const toneFilled = doc.tone_words.filter((t) => t.trim()).length;
  sections.push({
    section: 1,
    label: "Three tone words",
    status: toneFilled === 3 ? "present" : toneFilled > 0 ? "weak" : "missing",
    reason:
      toneFilled === 3
        ? "All three tone words filled."
        : toneFilled === 0
          ? "No tone words — the LLM has no high-level voice anchor."
          : `Only ${toneFilled}/3 tone words filled.`,
    scoring_critical: false,
  });

  // §2 — banned words. Drives the deterministic vocabulary sub-score.
  const bwCount = doc.banned_words.filter((b) => b.word.trim()).length;
  sections.push({
    section: 2,
    label: "Banned words and phrases",
    status:
      bwCount >= MIN_CONTENT.banned_words
        ? "present"
        : bwCount > 0
          ? "weak"
          : "missing",
    reason:
      bwCount >= MIN_CONTENT.banned_words
        ? `${bwCount} banned words — deterministic vocab checks active.`
        : bwCount > 0
          ? `Only ${bwCount} banned word${bwCount === 1 ? "" : "s"}; recommend at least ${MIN_CONTENT.banned_words}.`
          : "No banned words — deterministic vocab checks are disabled.",
    scoring_critical: true,
  });

  // §3 — cadence rules. LLM tone/cadence scoring uses these.
  const cadenceCount = doc.cadence_rules.filter((r) => r.trim()).length;
  sections.push({
    section: 3,
    label: "Required cadence rules",
    status:
      cadenceCount >= 2 ? "present" : cadenceCount > 0 ? "weak" : "missing",
    reason:
      cadenceCount >= 2
        ? `${cadenceCount} cadence rules — LLM has explicit cadence anchors.`
        : cadenceCount === 1
          ? "Only 1 cadence rule — recommend at least 2 for nuanced scoring."
          : "No cadence rules — LLM has no explicit anchor for sentence structure or rhythm.",
    scoring_critical: true,
  });

  // §4 — voice-on examples. The strongest positive pairwise anchor.
  const voiceOnCount = doc.voice_on_examples.filter((e) => e.trim()).length;
  sections.push({
    section: 4,
    label: "Voice-on examples",
    status:
      voiceOnCount >= MIN_CONTENT.voice_on_examples
        ? "present"
        : voiceOnCount > 0
          ? "weak"
          : "missing",
    reason:
      voiceOnCount >= MIN_CONTENT.voice_on_examples
        ? `${voiceOnCount} voice-on examples — pairwise tone scoring well-anchored.`
        : voiceOnCount > 0
          ? `Only ${voiceOnCount} voice-on example${voiceOnCount === 1 ? "" : "s"}; recommend at least ${MIN_CONTENT.voice_on_examples}.`
          : "No voice-on examples — pairwise scoring has no positive anchor. Tone score will be unreliable.",
    scoring_critical: true,
  });

  // §5 — voice-off examples. The negative pairwise anchor.
  const voiceOffCount = doc.voice_off_examples.filter(
    (e) => e.example.trim()
  ).length;
  sections.push({
    section: 5,
    label: "Voice-off examples",
    status:
      voiceOffCount >= MIN_CONTENT.voice_off_examples
        ? "present"
        : voiceOffCount > 0
          ? "weak"
          : "missing",
    reason:
      voiceOffCount >= MIN_CONTENT.voice_off_examples
        ? `${voiceOffCount} voice-off examples — pairwise scoring has both positive and negative anchors.`
        : voiceOffCount > 0
          ? `Only ${voiceOffCount} voice-off example; recommend at least ${MIN_CONTENT.voice_off_examples}.`
          : "No voice-off examples — LLM can recognize on-brand but struggles to anchor what off-brand means.",
    scoring_critical: true,
  });

  // §6 — punctuation rules. Drives the deterministic punctuation sub-score.
  const hasPunct = doc.punctuation.exclamation !== "freely";
  sections.push({
    section: 6,
    label: "Punctuation rules",
    status: hasPunct ? "present" : "weak",
    reason: hasPunct
      ? `Exclamation policy set to "${doc.punctuation.exclamation.replace("_", " ")}".`
      : "Exclamation marks unrestricted — deterministic punctuation check disabled.",
    scoring_critical: true,
  });

  // §7 — CTA rules. Useful but doesn't affect the scoring pipeline directly.
  const ctaCount =
    (doc.cta.preferred?.length ?? 0) +
    (doc.cta.banned?.length ?? 0) +
    (doc.cta.tone ? 1 : 0);
  sections.push({
    section: 7,
    label: "CTA voice rules",
    status: ctaCount >= 2 ? "present" : ctaCount > 0 ? "weak" : "missing",
    reason:
      ctaCount >= 2
        ? "CTA rules captured."
        : ctaCount > 0
          ? "CTA rules partially captured."
          : "No CTA rules — the LLM has no anchor for ask-tone.",
    scoring_critical: false,
  });

  // §8 — required-term swaps. Drives deterministic terminology checks.
  const termCount = doc.required_terms.filter(
    (t) => t.use.trim() && t.not.trim()
  ).length;
  sections.push({
    section: 8,
    label: "Industry-specific terminology",
    status: termCount >= 1 ? "present" : "missing",
    reason:
      termCount >= 1
        ? `${termCount} required-term swap${termCount === 1 ? "" : "s"} — deterministic terminology checks active.`
        : "No required-term swaps — terminology consistency isn't enforced.",
    scoring_critical: true,
  });

  // §9 — exceptions. Purely informational.
  const exceptionCount = (doc.exceptions ?? []).filter((e) =>
    e.exception.trim()
  ).length;
  sections.push({
    section: 9,
    label: "Client-specific exceptions",
    status: exceptionCount > 0 ? "present" : "missing",
    reason:
      exceptionCount > 0
        ? `${exceptionCount} exception${exceptionCount === 1 ? "" : "s"} documented.`
        : "No exceptions documented (often correct — most brands don't break their own rules).",
    scoring_critical: false,
  });

  // §10 — examples gallery. Additional pairwise anchor corpus.
  const galleryCount = doc.examples_gallery.filter((g) => g.trim()).length;
  sections.push({
    section: 10,
    label: "Examples gallery",
    status:
      galleryCount >= MIN_CONTENT.examples_gallery
        ? "present"
        : galleryCount > 0
          ? "weak"
          : "missing",
    reason:
      galleryCount >= MIN_CONTENT.examples_gallery
        ? `${galleryCount} gallery examples — pairwise corpus is substantial.`
        : galleryCount > 0
          ? `Only ${galleryCount} gallery example${galleryCount === 1 ? "" : "s"}; recommend at least ${MIN_CONTENT.examples_gallery}.`
          : "No gallery examples — pairwise scoring leans entirely on the voice-on and voice-off examples.",
    scoring_critical: true,
  });

  // Compute weighted score. Each weighted section contributes its full weight
  // if "present", half if "weak", zero if "missing".
  const weightFor = (section: number): number => {
    switch (section) {
      case 2:
        return WEIGHTS.banned_words;
      case 3:
        return WEIGHTS.cadence_rules;
      case 4:
        return WEIGHTS.voice_on_examples;
      case 5:
        return WEIGHTS.voice_off_examples;
      case 6:
        return WEIGHTS.punctuation;
      case 8:
        return WEIGHTS.required_terms;
      case 10:
        return WEIGHTS.examples_gallery;
      default:
        return 0;
    }
  };

  let raw = 0;
  for (const s of sections) {
    const w = weightFor(s.section);
    if (s.status === "present") raw += w;
    else if (s.status === "weak") raw += w / 2;
  }

  const score = Math.round(raw);
  const summary = summarize(score, sections);

  return { score, sections, summary };
}

function summarize(score: number, sections: SectionAssessment[]): string {
  // Use the human-readable section labels here, never the internal "§N"
  // markers — this string is shown to the user as the panel's hero summary.
  const missingCritical = sections
    .filter((s) => s.status === "missing" && s.scoring_critical)
    .map((s) => s.label.toLowerCase());
  if (score >= 9) return "Strong voice doc — scoring is well-anchored.";
  if (score >= 7) {
    return missingCritical.length === 0
      ? "Solid voice doc — scoring will be reliable."
      : `Solid doc but missing ${missingCritical.join(", ")}; results may have higher variance.`;
  }
  if (score >= 5) {
    return missingCritical.length === 0
      ? "Workable doc — fill in the weak sections for sharper results."
      : `Workable but missing ${missingCritical.join(", ")} — fill these to improve scoring reliability.`;
  }
  return "Doc is too thin for reliable scoring. Fill the missing sections before relying on the output.";
}
