#!/usr/bin/env node
/**
 * Battle-test for the import provenance / origin tags.
 *
 * The "from your doc" vs "we filled this in" tag must be driven by the LLM's
 * SEMANTIC judgement of whether content is stated in the doc — NOT by whether a
 * heading happened to match a regex alias. So we throw deliberately-varied
 * client docs at /api/import-doc (different heading names + vocabulary), each
 * RUNS times (LLM output isn't deterministic — per our consistency doctrine we
 * check the result is STABLE), and assert:
 *   - sections explicitly STATED in the doc  -> in stated_sections ("from your doc")
 *   - sections absent or only inferable       -> NOT in stated_sections
 *
 * Prereq: dev server running (`npm run dev`). Needs ANTHROPIC_API_KEY (via the
 * astro.config env-bridge). Usage: `npm run test:provenance`.
 */

const BASE = process.env.BVC_URL || "http://localhost:4321";
const RUNS = Number(process.env.RUNS || 3);

const SECTION_NAME = {
  1: "tone", 2: "banned", 3: "cadence", 4: "voice-on", 5: "voice-off",
  6: "punctuation", 7: "cta", 8: "terminology", 9: "exceptions", 10: "gallery",
};

// Each doc uses NON-standard headings on purpose, so the regex alias list can't
// carry it — the LLM provenance has to.
const DOCS = [
  {
    name: "Formal SaaS (Northstar) — headings the alias list doesn't know",
    md: `# Northstar Analytics — Brand Voice

## Personality
Three words for how we sound: clear, rigorous, unhurried.

## Language We Reject
We never use these words:
- "synergy" — empty corporate filler
- "disrupt" — overused startup cliché
- "leverage" — just say "use"
`,
    expectStated: [1, 2],
    expectNotStated: [4, 5, 7, 10],
  },
  {
    name: "Casual creator (bloom) — lowercase prose headings",
    md: `# bloom — my brand voice

## my whole vibe
i want everything to sound warm, playful, and honest.

## words that make me cringe
- "literally" — i overuse it, cut it
- "obsessed" — everyone says it
- "iconic" — meaningless now

## how i actually write
short sentences. lowercase mostly. never more than one emoji.
`,
    expectStated: [1, 2, 3],
    expectNotStated: [5, 7, 10],
  },
  {
    name: "Luxury fashion (Atelier Vance) — unusual headings, rich content",
    md: `# Atelier Vance — Voice

## Our Register
Restrained, precise, quietly confident.

## The Forbidden Lexicon
- "cheap" — we never compete on price
- "sale" — we hold "private previews"
- "trendy" — we are not trends

## On Punctuation
Never use exclamation marks. Em dashes are welcome, used sparingly.

## What We Name Things
A garment is always a "piece", never a "product". A buyer is a "client", never a "customer".
`,
    expectStated: [1, 2, 6, 8],
    expectNotStated: [4, 5, 10],
  },
  {
    name: "Sparse (Corner Loaf) — only tone stated; nothing else",
    md: `# Corner Loaf Bakery — Voice

## Tone
Warm, neighbourly, unfussy.
`,
    // Only tone is stated. Crucially, if the LLM infers punctuation/cadence from
    // the tone (like it did for North Field), those must be flagged "inferred"
    // and therefore must NOT appear as "from your doc".
    expectStated: [1],
    expectNotStated: [2, 4, 5, 6, 7, 10],
  },
];

async function importDoc(md, filename, attempt = 1) {
  const fd = new FormData();
  fd.append("file", new File([md], filename, { type: "text/markdown" }));
  // Astro's CSRF check requires a same-origin Origin header on multipart POSTs
  // (the browser sends one automatically; a bare fetch does not).
  try {
    const res = await fetch(`${BASE}/api/import-doc`, {
      method: "POST",
      body: fd,
      headers: { origin: BASE },
    });
    const payload = await res.json();
    if (payload.ok) return payload.data;
    // Retry transient upstream blips (LLM connection errors); never retry a
    // deterministic rejection like invalid_input.
    if (attempt < 4 && payload.error === "anthropic_error") {
      throw new Error("transient: " + payload.message);
    }
    throw new Error(`import failed: ${payload.error} — ${payload.message}`);
  } catch (e) {
    if (attempt < 4 && /transient|fetch failed|ECONNRESET|Connection/i.test(String(e.message))) {
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      return importDoc(md, filename, attempt + 1);
    }
    throw e;
  }
}

function setEq(a, b) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

async function main() {
  // server reachable?
  try { await fetch(`${BASE}/`); } catch {
    console.error(`✗ Cannot reach ${BASE}. Start the dev server first: npm run dev`);
    process.exit(2);
  }

  let failures = 0;
  for (const doc of DOCS) {
    console.log("\n" + "=".repeat(78));
    console.log(doc.name);
    console.log("=".repeat(78));
    const statedRuns = [];
    let lastData = null;
    for (let r = 0; r < RUNS; r++) {
      const data = await importDoc(doc.md, `mock-${doc.name.slice(0, 8)}.md`);
      lastData = data;
      const stated = (data.stated_sections || []).slice().sort((a, b) => a - b);
      statedRuns.push(stated);
      console.log(`  run ${r + 1}: stated = [${stated.map((s) => SECTION_NAME[s]).join(", ")}]`);
    }
    // Stability across runs
    const stable = statedRuns.every((s) => setEq(s, statedRuns[0]));
    console.log(`  stability across ${RUNS} runs: ${stable ? "STABLE ✓" : "⚠ UNSTABLE"}`);
    if (!stable) failures++;

    // Assertions against the most recent run's stated set + section statuses
    const stated = new Set(statedRuns[statedRuns.length - 1]);
    const statusBySection = {};
    for (const s of lastData.strength.sections) statusBySection[s.section] = s.status;

    for (const s of doc.expectStated) {
      const ok = stated.has(s);
      console.log(`  ${ok ? "✓" : "✗ FAIL"} ${SECTION_NAME[s]} should be "from your doc"  (stated=${ok}, status=${statusBySection[s]})`);
      if (!ok) failures++;
    }
    for (const s of doc.expectNotStated) {
      const ok = !stated.has(s);
      console.log(`  ${ok ? "✓" : "✗ FAIL"} ${SECTION_NAME[s]} must NOT be "from your doc"  (stated=${!ok}, status=${statusBySection[s]})`);
      if (!ok) failures++;
    }
  }

  console.log("\n" + "=".repeat(78));
  if (failures === 0) {
    console.log("ALL PROVENANCE CHECKS PASSED ✓");
    process.exit(0);
  } else {
    console.log(`${failures} CHECK(S) FAILED ✗`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(2); });
