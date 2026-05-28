/**
 * Studio North voice + draft fixtures.
 *
 * Each fixture pairs a brand voice doc with a draft. The voice docs follow
 * the 10-section structure from public/brand-voice-template.md so the
 * deterministic pre-pass (banned words / punctuation / required terms) and
 * the LLM pairwise scoring (against §4 voice-on + §5 voice-off + §10 gallery)
 * both have stable input to read.
 *
 * The two Aurelia fixtures share the same voice doc and differ only in the
 * draft — one off-brand (to show heavy flagging), one on-brand (control).
 */
export interface VoiceSample {
  id:
    | "aurelia-lashes"
    | "mantra-yoga"
    | "eckhardt-clinic"
    | "aurelia-clean";
  client: string;
  vertical: string;
  voiceDoc: string;
  draft: string;
}

const AURELIA_VOICE_DOC = `# Voice doc — Aurelia Lashes

## 1. Three tone words
- Tone 1: warm
- Tone 2: precise
- Tone 3: sensory

## 2. Banned words and phrases
- \`amazing\` — overused, hollow
- \`incredible\` — same problem
- \`literally\` — filler intensifier
- \`game-changer\` — startup cliché, wrong vertical
- \`hack\` — wrong register for craft beauty
- \`you won't believe\` — clickbait cadence, off-brand

## 3. Required cadence rules
- Sentence length: short, mixed in with medium. Never long.
- First-person stance: "we" for the brand; speak to "you" (single reader).
- Question-to-statement ratio: mostly statements. One soft question per post at most.
- Prefer sensory details (texture, weight, time) over evaluative claims ("best", "amazing").

## 4. Voice-on examples
> Holds 16 hours. Comfortable enough to forget you're wearing them.

> The new formula sets in 90 seconds, then disappears. No tug at the lash line.

> Weightless. Holds clean through a long day. That's the brief.

## 5. Voice-off examples
> Literally the most AMAZING lashes ever!!! — (wrong because: three banned words, multiple exclamation marks, hype tone, no sensory detail)

> You won't believe how good these feel — game-changer for our clients! — (wrong because: clickbait opener, banned phrase, banned word, banned punctuation pattern)

> The hack every lash artist needs — incredible hold!! — (wrong because: "hack" register is wrong for craft beauty, "incredible" is banned, double exclamation banned)

## 6. Punctuation rules
- Exclamation marks: at most one per post. Never multiple in a row.
- Em-dashes: yes, sparingly, for a beat.
- Ellipses: rarely. Only when the pause is genuinely there.
- Emojis: never in feed copy. Once per story max.

## 7. CTA voice rules
- Preferred CTA phrases: "Book the application", "See the wear test", "Read how it sets".
- Banned CTA phrases: "DM us now!", "Don't miss out!", "Last chance!".
- Tone of the ask: measured, direct, no urgency theater.

## 8. Industry-specific terminology
- Use "lashes" or "set", not "extensions" in feed copy.
- Use "wear" (verb), not "rock" — wrong register.
- Use "application", not "appointment" — it's a craft service.
- Use "lash artist", not "technician".

## 9. Client-specific exceptions
- Exception: one exclamation mark allowed on a launch-day announcement post.
- When: only on the day of a new product drop, not in the lead-up.

## 10. Examples gallery
> Six weeks in. The bond on the inner corner still holds — that's the test.

> A clean lash line is a quiet thing. No glue ridge. No gaps. Just lash.

> Our pro-formula glue sets in 90 seconds. After that, you stop thinking about it.

> A new wear test. 18 hours, two workouts, one shower. The set held.

> Comfortable enough to forget. That's the line we hold to.

> The right glue is the difference between a set you tolerate and a set you forget about.
`;

const MANTRA_VOICE_DOC = `# Voice doc — Mantra Yoga

## 1. Three tone words
- Tone 1: calm
- Tone 2: grounded
- Tone 3: honest

## 2. Banned words and phrases
- \`hustle\` — opposite of the practice
- \`crush\` — violent register, wrong for yoga
- \`grind\` — same problem
- \`game-changer\` — startup cliché
- \`literally\` — filler intensifier
- \`amazing\` — hollow
- \`hardcore\` — wrong register for the practice
- \`level up\` — gamified language, off-brand

## 3. Required cadence rules
- Sentence length: short. Mostly very short.
- First-person stance: "we" sparingly. Mostly speak directly to the practitioner.
- Question-to-statement ratio: statements. Questions feel like marketing here.
- Never lecture. Speak to the practitioner, not at them.

## 4. Voice-on examples
> A mat that holds steady through a full vinyasa. That's it. That's the post.

> Tuesday 7am, intermediate. Doors open at 6:45.

> Slower than last week's class. Same shape. Different feel.

## 5. Voice-off examples
> CRUSH your yoga practice with this game-changer mat! — (wrong because: violent verb, banned word, banned punctuation, hustle-bro register)

> Level up your hardcore vinyasa game — you'll literally never go back!! — (wrong because: gamified language, banned word "hardcore", filler "literally", exclamation overuse)

> Don't miss this amazing chance to crush your flow! — (wrong because: urgency theater, hollow "amazing", violent "crush", exclamation mark)

## 6. Punctuation rules
- Exclamation marks: never. No exceptions.
- Em-dashes: yes, for a held beat.
- Ellipses: rarely.
- Emojis: never in feed copy.

## 7. CTA voice rules
- Preferred CTA phrases: "Book a class", "See the schedule", "Drop in Tuesday".
- Banned CTA phrases: "Don't miss out!", "Level up today!", "Crush your next class!".
- Tone of the ask: quiet, factual. The class is happening either way.

## 8. Industry-specific terminology
- Use "practitioner", not "user" or "customer".
- Use "practice", not "workout".
- Use "class", not "session".
- Use "teacher", not "instructor" in feed copy.

## 9. Client-specific exceptions
- Exception: none. The voice is consistent across launch, regular, and partnership content.
- When: —

## 10. Examples gallery
> Mats arrive Friday. New batch, same cork. Reserve at the front desk.

> Slow flow at 6pm. Built around long holds and steady breath.

> A class for tired bodies. No music, no rush.

> Tuesday's intermediate class is now full. Wednesday at 7am has room.

> The mat we keep coming back to is the one that doesn't ask for attention.

> Six teachers. One schedule. Same room since 2019.
`;

const ECKHARDT_VOICE_DOC = `# Voice doc — Dr. Eckhardt Clinic

## 1. Three tone words
- Tone 1: authoritative
- Tone 2: warm
- Tone 3: evidence-led

## 2. Banned words and phrases
- \`very\` — empty intensifier
- \`really\` — same
- \`super\` — informal, wrong register for medical
- \`totally\` — same
- \`we can't wait\` — overeager, wrong register for clinic
- \`game-changer\` — startup cliché
- \`amazing\` — hollow
- \`life-changing\` — overclaim, regulatory risk in medical

## 3. Required cadence rules
- Sentence length: medium. Complete sentences, never fragments in patient-facing copy.
- First-person stance: "we" (the clinic) and "Dr. Eckhardt" by name in clinical posts.
- Question-to-statement ratio: statements. Patient-facing questions only when genuinely soliciting input.
- Cite a study, a percentage, or a duration whenever you make a claim about efficacy.

## 4. Voice-on examples
> Six weeks of consistent use produced measurable scalp recovery in 87% of patients in our pilot study.

> Dr. Eckhardt's keratin protocol is now available to patients following an initial consultation.

> Three sessions, six weeks apart. The protocol is built around the regrowth cycle, not the appointment book.

## 5. Voice-off examples
> We're REALLY excited to share this super-effective treatment with our clients! — (wrong because: "really" and "super" are banned empty intensifiers, "clients" should be "patients", exclamation mark, overeager tone)

> This treatment is literally a game-changer for our customers — can't wait for you to try it! — (wrong because: "literally" filler, "game-changer" banned, "customers" should be "patients", "can't wait" overeager)

> Our amazing new scalp protocol will totally transform your hair! — (wrong because: "amazing" hollow, "totally" empty intensifier, overclaim "transform", exclamation mark)

## 6. Punctuation rules
- Exclamation marks: never in patient-facing copy.
- Em-dashes: yes, used sparingly.
- Ellipses: never. Reads informal, wrong register.
- Emojis: never. No exceptions.

## 7. CTA voice rules
- Preferred CTA phrases: "Book a consultation", "Request a callback", "Read the study summary".
- Banned CTA phrases: "Don't miss out!", "Limited spots!", "Try it today!".
- Tone of the ask: measured, professional. Never urgent.

## 8. Industry-specific terminology
- Use "patients", not "clients" or "customers". Always.
- Use "consultation", not "appointment" in patient-facing copy.
- Use "protocol", not "treatment plan" in clinical posts.
- Use "Dr. Eckhardt" on first reference, "the clinic" thereafter.

## 9. Client-specific exceptions
- Exception: recruiting posts (staff hiring) can be slightly warmer, less formal.
- When: only on posts tagged as careers/hiring.

## 10. Examples gallery
> A new study from the European Hair Research Society confirms what our six-month pilot found: consistent keratin protocols outperform single-session treatments by a measurable margin.

> Dr. Eckhardt presented findings from our scalp recovery pilot at the Vienna dermatology symposium last week.

> Consultations for the keratin protocol are now booking into the autumn cycle. Reach the front desk for availability.

> A common question from patients: how long until results are visible? Six to eight weeks of consistent use, in most cases.

> The clinic is closed Monday for staff training. Standard hours resume Tuesday.

> Three referral partners now accept patients into Dr. Eckhardt's protocol following an initial screening at their own clinic.
`;

export const VOICE_SAMPLES: VoiceSample[] = [
  {
    id: "aurelia-lashes",
    client: "Aurelia Lashes",
    vertical: "Beauty",
    voiceDoc: AURELIA_VOICE_DOC,
    draft:
      "Our new lash glue is literally amazing — the hold is a game-changer compared to anything else on the market!!! You won't believe how good it feels!",
  },
  {
    id: "mantra-yoga",
    client: "Mantra Yoga",
    vertical: "Yoga studio",
    voiceDoc: MANTRA_VOICE_DOC,
    draft:
      "Our new mat is literally a game-changer for your practice — finally a mat that won't let you down during a hardcore vinyasa flow! You're going to crush your next session.",
  },
  {
    id: "eckhardt-clinic",
    client: "Dr. Eckhardt Clinic",
    vertical: "Professional services (medical)",
    voiceDoc: ECKHARDT_VOICE_DOC,
    draft:
      "We're really excited to introduce our new keratin scalp treatment to our clients. It's super effective and we can't wait for you to try it!",
  },
  {
    id: "aurelia-clean",
    client: "Aurelia Lashes (on-brand control)",
    vertical: "Beauty",
    voiceDoc: AURELIA_VOICE_DOC,
    draft:
      "Holds 16 hours. Comfortable enough to forget you're wearing them. The new formula sets in 90 seconds, then disappears. No tug at the lash line.",
  },
];

export function findVoiceSample(id: string): VoiceSample | undefined {
  return VOICE_SAMPLES.find((s) => s.id === id);
}
