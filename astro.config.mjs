import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";

// Server output mode is required because the tools call Anthropic from
// /api/* routes. The Vercel adapter handles serverless function packaging.
export default defineConfig({
  output: "server",
  adapter: vercel(),
  site: process.env.SITE_URL ?? "http://localhost:4321",
});
