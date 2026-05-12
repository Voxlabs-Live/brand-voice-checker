import type { APIRoute } from "astro";
import { callCached, parseJson } from "../../lib/anthropic";
import { readDemo, consumeDemo } from "../../lib/rate-limit";
import { VOICE_SYSTEM_PROMPT } from "../../prompts/system";
import type { VoiceResult } from "../../lib/voice-types";
import type { ApiResponse } from "../../lib/types";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  // Step 1 — rate limit
  const usage = await readDemo(request);
  if (usage.exceeded) {
    return json<VoiceResult>({
      ok: false,
      error: "rate_limit_exceeded",
      message: "Demo limit reached. Fork the repo to keep using.",
    });
  }

  // Step 2 — validate input
  let body: { voiceDoc?: string; draft?: string };
  try {
    body = await request.json();
  } catch {
    return json<VoiceResult>({
      ok: false,
      error: "invalid_input",
      message: "Body must be JSON with `voiceDoc` and `draft` fields.",
    });
  }
  const voiceDoc = (body.voiceDoc ?? "").trim();
  const draft = (body.draft ?? "").trim();
  if (!voiceDoc || !draft) {
    return json<VoiceResult>({
      ok: false,
      error: "invalid_input",
      message: "Paste both the voice doc and a draft.",
    });
  }
  if (voiceDoc.length > 12000 || draft.length > 6000) {
    return json<VoiceResult>({
      ok: false,
      error: "invalid_input",
      message:
        "Inputs too long. Voice doc ≤12k chars, draft ≤6k chars.",
    });
  }

  // Step 3 — call Claude
  const userInput = `BRAND VOICE DOC:\n\n${voiceDoc}\n\n---\n\nDRAFT TO CHECK:\n\n${draft}`;
  let raw: string;
  try {
    const result = await callCached({
      systemPrompt: VOICE_SYSTEM_PROMPT,
      userInput,
      maxTokens: 2200,
    });
    raw = result.text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = msg.includes("ANTHROPIC_API_KEY")
      ? "missing_api_key"
      : "anthropic_error";
    return json<VoiceResult>({ ok: false, error: code, message: msg });
  }

  // Step 4 — parse JSON
  let data: VoiceResult;
  try {
    data = parseJson<VoiceResult>(raw);
  } catch {
    return json<VoiceResult>({
      ok: false,
      error: "parse_error",
      message: "Claude returned non-JSON. Try again.",
    });
  }

  // Step 5 — consume one demo credit
  await consumeDemo(request);
  const remaining =
    usage.remaining === Infinity ? -1 : Math.max(0, usage.remaining - 1);

  return json<VoiceResult>({ ok: true, data, remaining });
};

function json<T>(payload: ApiResponse<T>): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
