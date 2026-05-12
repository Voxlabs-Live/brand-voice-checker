/**
 * Studio North voice + draft fixtures.
 *
 * Each fixture pairs a brand voice doc with an off-brand draft so the demo
 * shows a clear violation set when the buyer picks "Try a sample." The voice
 * docs are short on purpose — short voice docs are realistic for small
 * agencies, and they make the "cited rule" feature obvious in the output.
 *
 * One bonus fixture (aurelia-clean) pairs a voice doc with an ON-BRAND
 * draft, so the buyer sees what a high-score, zero-flag output looks like.
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

export const VOICE_SAMPLES: VoiceSample[] = [
  {
    id: "aurelia-lashes",
    client: "Aurelia Lashes",
    vertical: "Beauty",
    voiceDoc: `Voice for Aurelia Lashes.
Tone: warm-precise. Confident about the craft, never hyped.
Banned words: amazing, incredible, literally, game-changer, hack.
Punctuation: at most one exclamation mark per post; never multiple in a row.
Cadence: short sentences, sensory details over claims.
On-brand example: "Holds 16 hours. Comfortable enough to forget you're wearing them."
Off-brand example: "Literally the most AMAZING lashes ever!!!"`,
    draft:
      "Our new lash glue is literally amazing — the hold is a game-changer compared to anything else on the market!!! You won't believe how good it feels!",
  },
  {
    id: "mantra-yoga",
    client: "Mantra Yoga",
    vertical: "Yoga studio",
    voiceDoc: `Voice for Mantra Yoga.
Tone: calm, grounded, never hustle-bro.
Banned words: hustle, crush, grind, game-changer, literally, amazing, hardcore.
Punctuation: no exclamation marks ever.
Cadence: short sentences. Never lecture. Speak to the practitioner, not at them.
On-brand: "A mat that holds steady through a full vinyasa. That's it. That's the post."
Off-brand: "CRUSH your yoga practice with this game-changer mat!"`,
    draft:
      "Our new mat is literally a game-changer for your practice — finally a mat that won't let you down during a hardcore vinyasa flow! You're going to crush your next session.",
  },
  {
    id: "eckhardt-clinic",
    client: "Dr. Eckhardt Clinic",
    vertical: "Professional services (medical)",
    voiceDoc: `Voice for Dr. Eckhardt Clinic.
Tone: authoritative-warm. Informed, never clinical-cold; warm, never casual.
Always "patients", never "clients" or "customers".
No emojis. Formal punctuation. No exclamation marks in patient-facing copy.
Avoid empty intensifiers: very, really, super, totally.
On-brand: "Six weeks of consistent use produced measurable scalp recovery in 87% of patients in our pilot."
Off-brand: "We're REALLY excited to share this super-effective treatment with our clients!"`,
    draft:
      "We're really excited to introduce our new keratin scalp treatment to our clients. It's super effective and we can't wait for you to try it!",
  },
  {
    id: "aurelia-clean",
    client: "Aurelia Lashes (on-brand control)",
    vertical: "Beauty",
    voiceDoc: `Voice for Aurelia Lashes.
Tone: warm-precise. Confident about the craft, never hyped.
Banned words: amazing, incredible, literally, game-changer, hack.
Punctuation: at most one exclamation mark per post; never multiple in a row.
Cadence: short sentences, sensory details over claims.`,
    draft:
      "Holds 16 hours. Comfortable enough to forget you're wearing them. The new formula sets in 90 seconds, then disappears.",
  },
];

export function findVoiceSample(id: string): VoiceSample | undefined {
  return VOICE_SAMPLES.find((s) => s.id === id);
}
