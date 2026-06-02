import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";
import { readFileSync } from "node:fs";

// Bridge .env.local secrets into process.env for local dev.
//
// As of the Astro 6 upgrade, Vite exposes .env vars only via import.meta.env
// (statically-referenced keys only) and no longer mirrors them into
// process.env. Our /api/* routes read secrets (ANTHROPIC_API_KEY, Upstash
// creds) from process.env — exactly how Vercel injects them at runtime — so
// plain `npm run dev` sees them as unset.
//
// We parse .env.local directly rather than using Vite's loadEnv() because
// loadEnv lets an existing process.env value override the file. That matters:
// some shells (e.g. an agent/CI context) export ANTHROPIC_API_KEY="" — an
// empty string that would otherwise shadow the real key. So we backfill only
// when the var is unset OR empty, letting a genuinely-exported shell value (or
// Vercel's runtime value) still win. On Vercel this try/catch is a no-op:
// .env.local isn't deployed, so the read throws and we fall through to the
// platform-provided process.env.
try {
  const raw = readFileSync(new URL("./.env.local", import.meta.url), "utf8");
  for (const line of raw.split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value; // unset or empty -> backfill
  }
} catch {
  // No .env.local present (e.g. on Vercel) — rely on the platform's process.env.
}

// Server output mode is required because the tools call Anthropic from
// /api/* routes. The Vercel adapter handles serverless function packaging.
export default defineConfig({
  output: "server",
  adapter: vercel(),
  site: process.env.SITE_URL ?? "http://localhost:4321",
});
