/**
 * Studio North voice + draft fixtures (structured form).
 *
 * Each fixture pairs a typed VoiceDoc with a draft. The previous version
 * stored the voice doc as a markdown string that had to be parsed; now the
 * voice doc IS the structured object the form persists and the scoring
 * pipeline consumes directly.
 *
 * Sample ids use the SAMPLE_ID_PREFIX so the picker can distinguish them
 * from user-created docs and label them accordingly.
 */
import { SAMPLE_ID_PREFIX } from "../lib/voice-doc-storage";
import type { VoiceDoc } from "../lib/voice-doc-schema";

export interface VoiceSample {
  id: string;
  client: string;
  vertical: string;
  voiceDoc: VoiceDoc;
  /** A draft known to violate the voice doc (or, for the on-brand control, to match it). */
  draft: string;
}

const AURELIA_DOC: VoiceDoc = {
  id: `${SAMPLE_ID_PREFIX}aurelia-lashes`,
  client_name: "Aurelia Lashes",
  vertical: "Beauty",
  tone_words: ["warm", "precise", "sensory"],
  banned_words: [
    { word: "amazing", reason: "overused, hollow" },
    { word: "incredible", reason: "hollow superlative" },
    { word: "literally", reason: "filler intensifier" },
    { word: "game-changer", reason: "startup cliché, wrong vertical" },
    { word: "hack", reason: "wrong register for craft beauty" },
    { word: "you won't believe", reason: "clickbait cadence, off-brand" },
  ],
  cadence_rules: [
    "Sentence length: short, mixed in with medium. Never long.",
    'First-person stance: "we" for the brand; speak to "you" (single reader).',
    "Question-to-statement ratio: mostly statements. One soft question per post at most.",
    'Prefer sensory details (texture, weight, time) over evaluative claims ("best", "amazing").',
  ],
  voice_on_examples: [
    "Holds 16 hours. Comfortable enough to forget you're wearing them.",
    "The new formula sets in 90 seconds, then disappears. No tug at the lash line.",
    "Weightless. Holds clean through a long day. That's the brief.",
  ],
  voice_off_examples: [
    {
      example: "Literally the most AMAZING lashes ever!!!",
      why_wrong:
        "three banned words, multiple exclamation marks, hype tone, no sensory detail",
    },
    {
      example:
        "You won't believe how good these feel — game-changer for our clients!",
      why_wrong:
        "clickbait opener, banned phrase, banned word, banned punctuation pattern",
    },
    {
      example: "The hack every lash artist needs — incredible hold!!",
      why_wrong:
        "'hack' register is wrong for craft beauty, 'incredible' is banned, double exclamation banned",
    },
  ],
  punctuation: {
    exclamation: "at_most_one",
    em_dash: "yes, sparingly, for a beat",
    ellipsis: "rarely. Only when the pause is genuinely there.",
    emoji: "never",
  },
  cta: {
    preferred: [
      "Book the application",
      "See the wear test",
      "Read how it sets",
    ],
    banned: ["DM us now!", "Don't miss out!", "Last chance!"],
    tone: "measured, direct, no urgency theater",
  },
  required_terms: [
    { use: "lashes", not: "extensions", note: "in feed copy" },
    { use: "wear", not: "rock", note: "wrong register" },
    { use: "application", not: "appointment", note: "it's a craft service" },
    { use: "lash artist", not: "technician" },
  ],
  exceptions: [
    {
      exception: "one exclamation mark allowed on a launch-day announcement post",
      when: "only on the day of a new product drop, not in the lead-up",
    },
  ],
  examples_gallery: [
    "Six weeks in. The bond on the inner corner still holds — that's the test.",
    "A clean lash line is a quiet thing. No glue ridge. No gaps. Just lash.",
    "Our pro-formula glue sets in 90 seconds. After that, you stop thinking about it.",
    "A new wear test. 18 hours, two workouts, one shower. The set held.",
    "Comfortable enough to forget. That's the line we hold to.",
    "The right glue is the difference between a set you tolerate and a set you forget about.",
  ],
};

const MANTRA_DOC: VoiceDoc = {
  id: `${SAMPLE_ID_PREFIX}mantra-yoga`,
  client_name: "Mantra Yoga",
  vertical: "Yoga studio",
  tone_words: ["calm", "grounded", "honest"],
  banned_words: [
    { word: "hustle", reason: "opposite of the practice" },
    { word: "crush", reason: "violent register, wrong for yoga" },
    { word: "grind", reason: "hustle-culture term, wrong for yoga" },
    { word: "game-changer", reason: "startup cliché" },
    { word: "literally", reason: "filler intensifier" },
    { word: "amazing", reason: "hollow" },
    { word: "hardcore", reason: "wrong register for the practice" },
    { word: "level up", reason: "gamified language, off-brand" },
  ],
  cadence_rules: [
    "Sentence length: short. Mostly very short.",
    '"we" sparingly. Mostly speak directly to the practitioner.',
    "Statements over questions. Questions feel like marketing here.",
    "Never lecture. Speak to the practitioner, not at them.",
  ],
  voice_on_examples: [
    "A mat that holds steady through a full vinyasa. That's it. That's the post.",
    "Tuesday 7am, intermediate. Doors open at 6:45.",
    "Slower than last week's class. Same shape. Different feel.",
  ],
  voice_off_examples: [
    {
      example: "CRUSH your yoga practice with this game-changer mat!",
      why_wrong:
        "violent verb, banned word, banned punctuation, hustle-bro register",
    },
    {
      example:
        "Level up your hardcore vinyasa game — you'll literally never go back!!",
      why_wrong:
        "gamified language, banned word 'hardcore', filler 'literally', exclamation overuse",
    },
    {
      example: "Don't miss this amazing chance to crush your flow!",
      why_wrong:
        "urgency theater, hollow 'amazing', violent 'crush', exclamation mark",
    },
  ],
  punctuation: {
    exclamation: "never",
    em_dash: "yes, for a held beat",
    ellipsis: "rarely",
    emoji: "never",
  },
  cta: {
    preferred: ["Book a class", "See the schedule", "Drop in Tuesday"],
    banned: [
      "Don't miss out!",
      "Level up today!",
      "Crush your next class!",
    ],
    tone: "quiet, factual. The class is happening either way.",
  },
  required_terms: [
    { use: "practitioner", not: "user" },
    { use: "practice", not: "workout" },
    { use: "class", not: "session" },
    { use: "teacher", not: "instructor", note: "in feed copy" },
  ],
  exceptions: [],
  examples_gallery: [
    "Mats arrive Friday. New batch, same cork. Reserve at the front desk.",
    "Slow flow at 6pm. Built around long holds and steady breath.",
    "A class for tired bodies. No music, no rush.",
    "Tuesday's intermediate class is now full. Wednesday at 7am has room.",
    "The mat we keep coming back to is the one that doesn't ask for attention.",
    "Six teachers. One schedule. Same room since 2019.",
  ],
};

const ECKHARDT_DOC: VoiceDoc = {
  id: `${SAMPLE_ID_PREFIX}eckhardt-clinic`,
  client_name: "Dr. Eckhardt Clinic",
  vertical: "Professional services (medical)",
  tone_words: ["authoritative", "warm", "evidence-led"],
  banned_words: [
    { word: "very", reason: "empty intensifier" },
    { word: "really", reason: "empty intensifier" },
    { word: "super", reason: "informal, wrong register for medical" },
    { word: "totally", reason: "empty intensifier" },
    {
      word: "we can't wait",
      reason: "overeager, wrong register for clinic",
    },
    { word: "game-changer", reason: "startup cliché" },
    { word: "amazing", reason: "hollow" },
    {
      word: "life-changing",
      reason: "overclaim, regulatory risk in medical",
    },
  ],
  cadence_rules: [
    "Sentence length: medium. Complete sentences, never fragments in patient-facing copy.",
    '"we" (the clinic) and "Dr. Eckhardt" by name in clinical posts.',
    "Statements. Patient-facing questions only when genuinely soliciting input.",
    "Cite a study, a percentage, or a duration whenever you make a claim about efficacy.",
  ],
  voice_on_examples: [
    "Six weeks of consistent use produced measurable scalp recovery in 87% of patients in our pilot study.",
    "Dr. Eckhardt's keratin protocol is now available to patients following an initial consultation.",
    "Three sessions, six weeks apart. The protocol is built around the regrowth cycle, not the appointment book.",
  ],
  voice_off_examples: [
    {
      example:
        "We're REALLY excited to share this super-effective treatment with our clients!",
      why_wrong:
        "'really' and 'super' are banned empty intensifiers, 'clients' should be 'patients', exclamation mark, overeager tone",
    },
    {
      example:
        "This treatment is literally a game-changer for our customers — can't wait for you to try it!",
      why_wrong:
        "'literally' filler, 'game-changer' banned, 'customers' should be 'patients', 'can't wait' overeager",
    },
    {
      example: "Our amazing new scalp protocol will totally transform your hair!",
      why_wrong:
        "'amazing' hollow, 'totally' empty intensifier, overclaim 'transform', exclamation mark",
    },
  ],
  punctuation: {
    exclamation: "never",
    em_dash: "yes, used sparingly",
    ellipsis: "never. Reads informal, wrong register.",
    emoji: "never",
  },
  cta: {
    preferred: [
      "Book a consultation",
      "Request a callback",
      "Read the study summary",
    ],
    banned: ["Don't miss out!", "Limited spots!", "Try it today!"],
    tone: "measured, professional. Never urgent.",
  },
  required_terms: [
    { use: "patients", not: "clients" },
    { use: "patients", not: "customers" },
    { use: "consultation", not: "appointment", note: "in patient-facing copy" },
    { use: "protocol", not: "treatment plan", note: "in clinical posts" },
  ],
  exceptions: [
    {
      exception:
        "recruiting posts (staff hiring) can be slightly warmer, less formal",
      when: "only on posts tagged as careers/hiring",
    },
  ],
  examples_gallery: [
    "A new study from the European Hair Research Society confirms what our six-month pilot found: consistent keratin protocols outperform single-session treatments by a measurable margin.",
    "Dr. Eckhardt presented findings from our scalp recovery pilot at the Vienna dermatology symposium last week.",
    "Consultations for the keratin protocol are now booking into the autumn cycle. Reach the front desk for availability.",
    "A common question from patients: how long until results are visible? Six to eight weeks of consistent use, in most cases.",
    "The clinic is closed Monday for staff training. Standard hours resume Tuesday.",
    "Three referral partners now accept patients into Dr. Eckhardt's protocol following an initial screening at their own clinic.",
  ],
};

export const VOICE_SAMPLES: VoiceSample[] = [
  {
    id: AURELIA_DOC.id,
    client: AURELIA_DOC.client_name,
    vertical: AURELIA_DOC.vertical ?? "",
    voiceDoc: AURELIA_DOC,
    draft:
      "Our new lash glue is literally amazing — the hold is a game-changer compared to anything else on the market!!! You won't believe how good it feels!",
  },
  {
    id: MANTRA_DOC.id,
    client: MANTRA_DOC.client_name,
    vertical: MANTRA_DOC.vertical ?? "",
    voiceDoc: MANTRA_DOC,
    draft:
      "Our new mat is literally a game-changer for your practice — finally a mat that won't let you down during a hardcore vinyasa flow! You're going to crush your next session.",
  },
  {
    id: ECKHARDT_DOC.id,
    client: ECKHARDT_DOC.client_name,
    vertical: ECKHARDT_DOC.vertical ?? "",
    voiceDoc: ECKHARDT_DOC,
    draft:
      "We're really excited to introduce our new keratin scalp treatment to our clients. It's super effective and we can't wait for you to try it!",
  },
  {
    id: `${SAMPLE_ID_PREFIX}aurelia-clean`,
    client: "Aurelia Lashes (on-brand control)",
    vertical: AURELIA_DOC.vertical ?? "",
    voiceDoc: AURELIA_DOC,
    draft:
      "Holds 16 hours. Comfortable enough to forget you're wearing them. The new formula sets in 90 seconds, then disappears. No tug at the lash line.",
  },
];

export const SAMPLE_DOCS: VoiceDoc[] = [AURELIA_DOC, MANTRA_DOC, ECKHARDT_DOC];

export function findVoiceSample(id: string): VoiceSample | undefined {
  return VOICE_SAMPLES.find((s) => s.id === id);
}
