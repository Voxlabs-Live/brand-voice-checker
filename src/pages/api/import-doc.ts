import type { APIRoute } from "astro";
import { createHash } from "node:crypto";
import { callCached, parseJson } from "../../lib/anthropic";
import { readDemo, consumeDemo } from "../../lib/rate-limit";
import { IMPORT_CRITIQUE_SYSTEM_PROMPT } from "../../prompts/import-critique";
import { extractDocument } from "../../lib/doc-extractor";
import { detectSections } from "../../lib/section-detector";
import { extractFields } from "../../lib/field-extractor";
import { computeDocStrength, type DocStrength } from "../../lib/voice-doc-strength";
import type { VoiceDoc } from "../../lib/voice-doc-schema";
import type { ApiResponse } from "../../lib/types";

export const prerender = false;

/**
 * Response data the upload UI consumes. The user reviews these fields in the
 * pre-populated form + critique panel and explicitly saves — nothing is
 * auto-committed to localStorage.
 */
export interface ImportResult {
  /** Merged VoiceDoc: deterministic extraction + LLM-filled gaps. */
  doc: VoiceDoc;
  /** Deterministic strength score (computed by the server, never LLM). */
  strength: DocStrength;
  /** Sections the deterministic pass extracted at least partial content for. */
  deterministic_sections: number[];
  /** Detection rate from the section detector (0–10). */
  sections_detected: number;
  /** LLM-generated suggestions for missing/weak sections. */
  suggestions: Array<{
    section: number;
    section_label: string;
    suggestion: string;
    example_items?: Array<string | object>;
  }>;
  /** Original filename, useful for the saved doc's client_name fallback. */
  filename: string;
  format: "pdf" | "docx" | "markdown" | "text";
  /** Whether the result was served from cache (same content uploaded before). */
  cached: boolean;
}

interface LlmCritique {
  extracted_fields: Partial<VoiceDoc> & { client_name?: string; vertical?: string };
  suggestions: ImportResult["suggestions"];
}

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export const POST: APIRoute = async ({ request }) => {
  // Step 1 — rate limit (import counts as 2 credits since it's heavier).
  const usage = await readDemo(request);
  if (usage.exceeded) {
    return json<ImportResult>({
      ok: false,
      error: "rate_limit_exceeded",
      message: "Demo limit reached. Fork the repo to keep using.",
    });
  }

  // Step 2 — multipart upload.
  let file: File | null = null;
  try {
    const form = await request.formData();
    const candidate = form.get("file");
    if (candidate instanceof File) file = candidate;
  } catch {
    return json<ImportResult>({
      ok: false,
      error: "invalid_input",
      message: "Expected multipart/form-data with a `file` field.",
    });
  }
  if (!file) {
    return json<ImportResult>({
      ok: false,
      error: "invalid_input",
      message: "Upload a file under the `file` form field.",
    });
  }

  // Step 3 — extract text deterministically.
  const extract = await extractDocument(file);
  if (!extract.ok) {
    return json<ImportResult>({
      ok: false,
      error: extract.error,
      message: extract.message,
    });
  }

  // Step 4 — hash-cache the parsed text so re-uploading the same doc returns
  // identical extraction without re-calling the LLM. Variance bounded to
  // first-run on any given content.
  const docHash = createHash("sha256")
    .update(extract.text)
    .digest("hex")
    .slice(0, 16);

  const cached = await tryReadCache(docHash);
  if (cached) {
    await consumeDemo(request);
    return json<ImportResult>({
      ok: true,
      data: { ...cached, cached: true },
      remaining: -1,
    });
  }

  // Step 5 — deterministic section detection + field extraction.
  const sectionMap = detectSections(extract.text);
  const fieldResult = extractFields(sectionMap);

  // Step 6 — LLM fills gaps (sections the regex couldn't extract) + critique.
  const missingFromExtraction = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter(
    (n) => !fieldResult.filled.has(n)
  );
  const userInput = `RAW VOICE DOC TEXT:

${extract.text}

---

PRE-EXTRACTED (deterministic regex output):

${JSON.stringify(fieldResult.doc, null, 2)}

---

MISSING FROM EXTRACTION (sections the regex could not extract):
${missingFromExtraction.length === 0 ? "(none — regex extracted all sections)" : missingFromExtraction.join(", ")}`;

  let critique: LlmCritique;
  try {
    const { text } = await callCached({
      systemPrompt: IMPORT_CRITIQUE_SYSTEM_PROMPT,
      userInput,
      maxTokens: 3000,
    });
    critique = parseJson<LlmCritique>(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json<ImportResult>({
      ok: false,
      error: msg.includes("ANTHROPIC_API_KEY") ? "missing_api_key" : "anthropic_error",
      message: msg,
    });
  }

  // Step 7 — merge LLM extracted_fields into the deterministic doc. LLM only
  // fills fields where the deterministic extraction returned nothing.
  const mergedDoc = mergeLlmExtraction(fieldResult.doc, critique.extracted_fields, fieldResult.filled, extract.filename);

  // Step 8 — compute strength score DETERMINISTICALLY.
  const strength = computeDocStrength(mergedDoc);

  const result: ImportResult = {
    doc: mergedDoc,
    strength,
    deterministic_sections: Array.from(fieldResult.filled).sort((a, b) => a - b),
    sections_detected: sectionMap.foundCount,
    suggestions: Array.isArray(critique.suggestions) ? critique.suggestions : [],
    filename: extract.filename,
    format: extract.format,
    cached: false,
  };

  // Step 9 — cache for future identical uploads.
  await tryWriteCache(docHash, result);

  // Imports cost 2 demo credits (heavier than a draft check).
  await consumeDemo(request);
  await consumeDemo(request);

  const remaining =
    usage.remaining === Infinity ? -1 : Math.max(0, usage.remaining - 2);
  return json<ImportResult>({ ok: true, data: result, remaining });
};

/**
 * Merge LLM-extracted fields into the deterministic partial doc.
 *
 * Deterministic extractions are authoritative — LLM output only fills
 * fields the deterministic pass left empty (in the `filled` set). This
 * prevents the LLM from overwriting precise regex matches with vaguer
 * paraphrases.
 */
function mergeLlmExtraction(
  baseDoc: VoiceDoc,
  llm: LlmCritique["extracted_fields"],
  filled: Set<number>,
  filename: string
): VoiceDoc {
  const out: VoiceDoc = { ...baseDoc };

  if (llm.client_name && !out.client_name) {
    out.client_name = llm.client_name;
  } else if (!out.client_name) {
    // Fall back to the filename (stripped of extension) so the saved doc has
    // something to identify it.
    out.client_name = filename.replace(/\.[^.]+$/, "");
  }
  if (llm.vertical && !out.vertical) out.vertical = llm.vertical;

  if (!filled.has(1) && Array.isArray(llm.tone_words)) {
    out.tone_words = [
      llm.tone_words[0] ?? "",
      llm.tone_words[1] ?? "",
      llm.tone_words[2] ?? "",
    ];
  }
  if (!filled.has(2) && Array.isArray(llm.banned_words)) {
    out.banned_words = llm.banned_words.filter((b) => b && typeof b.word === "string" && b.word.trim());
  }
  if (!filled.has(3) && Array.isArray(llm.cadence_rules)) {
    out.cadence_rules = llm.cadence_rules.filter((r) => typeof r === "string" && r.trim());
  }
  if (!filled.has(4) && Array.isArray(llm.voice_on_examples)) {
    out.voice_on_examples = llm.voice_on_examples.filter((e) => typeof e === "string" && e.trim());
  }
  if (!filled.has(5) && Array.isArray(llm.voice_off_examples)) {
    out.voice_off_examples = llm.voice_off_examples.filter(
      (e) => e && typeof e.example === "string" && e.example.trim()
    );
  }
  if (!filled.has(6) && llm.punctuation) {
    out.punctuation = {
      ...out.punctuation,
      exclamation: llm.punctuation.exclamation ?? out.punctuation.exclamation,
      em_dash: llm.punctuation.em_dash ?? out.punctuation.em_dash,
      ellipsis: llm.punctuation.ellipsis ?? out.punctuation.ellipsis,
      emoji: llm.punctuation.emoji ?? out.punctuation.emoji,
    };
  }
  if (!filled.has(7) && llm.cta) {
    out.cta = { ...out.cta, ...llm.cta };
  }
  if (!filled.has(8) && Array.isArray(llm.required_terms)) {
    out.required_terms = llm.required_terms.filter(
      (t) => t && typeof t.use === "string" && typeof t.not === "string" && t.use.trim() && t.not.trim()
    );
  }
  if (!filled.has(9) && Array.isArray(llm.exceptions)) {
    out.exceptions = llm.exceptions.filter(
      (e) => e && typeof e.exception === "string" && e.exception.trim()
    );
  }
  if (!filled.has(10) && Array.isArray(llm.examples_gallery)) {
    out.examples_gallery = llm.examples_gallery.filter((g) => typeof g === "string" && g.trim());
  }

  return out;
}

/**
 * Cache helpers. Upstash creds may be absent in local dev (DEMO_MODE=false);
 * in that case caching silently no-ops.
 */
async function tryReadCache(hash: string): Promise<ImportResult | null> {
  try {
    const { Redis } = await import("@upstash/redis");
    const url =
      process.env.UPSTASH_REDIS_REST_URL ??
      process.env.UPSTASH_REDIS_REST_KV_REST_API_URL ??
      process.env.KV_REST_API_URL;
    const token =
      process.env.UPSTASH_REDIS_REST_TOKEN ??
      process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN ??
      process.env.KV_REST_API_TOKEN;
    if (!url || !token) return null;
    const redis = new Redis({ url, token });
    const cached = await redis.get<ImportResult>(`bvc:import:${hash}`);
    return cached ?? null;
  } catch {
    return null;
  }
}

async function tryWriteCache(hash: string, value: ImportResult): Promise<void> {
  try {
    const { Redis } = await import("@upstash/redis");
    const url =
      process.env.UPSTASH_REDIS_REST_URL ??
      process.env.UPSTASH_REDIS_REST_KV_REST_API_URL ??
      process.env.KV_REST_API_URL;
    const token =
      process.env.UPSTASH_REDIS_REST_TOKEN ??
      process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN ??
      process.env.KV_REST_API_TOKEN;
    if (!url || !token) return;
    const redis = new Redis({ url, token });
    await redis.set(`bvc:import:${hash}`, value, { ex: CACHE_TTL_SECONDS });
  } catch {
    // Cache write failure is non-fatal.
  }
}

function json<T>(payload: ApiResponse<T>): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
