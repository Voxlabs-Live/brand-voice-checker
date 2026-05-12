# Brand Voice Checker

Paste a brand voice doc and a draft. Get:

- a **voice-fit score** (0–100)
- **flagged phrases** highlighted in the draft, each with the **exact rule from the voice doc** it violates
- a **rewritten on-brand version** of the whole draft

Part of the [Agency Vibe-Coding Kit](https://voxlabs.live) — a $7 starter pack of four small tools your creative agency can run from a browser.

**Live demo:** [brand-voice.voxlabs.live](https://brand-voice.voxlabs.live) (5 free runs per visitor)

**Don't have a brand voice doc yet?** Use the [10-section starter template](./public/brand-voice-template.md) shipped with this repo. Fill it out once per client.

---

## Deploy your own copy (3 minutes, browser-only)

You don't need a terminal. You need a GitHub account, a Vercel account, and an Anthropic API key.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FVoxlabs-Live%2Fbrand-voice-checker&env=ANTHROPIC_API_KEY&envDescription=Get%20your%20Anthropic%20API%20key%20from%20console.anthropic.com&envLink=https%3A%2F%2Fconsole.anthropic.com%2Fsettings%2Fkeys)

1. Click **Deploy with Vercel**.
2. Sign in to GitHub. Vercel will fork this repo into your GitHub account.
3. Sign up for Vercel free tier (~3 min, no credit card needed).
4. Paste your **Anthropic API key** when prompted. Get one at [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys).
5. Click **Deploy**. Wait ~90 seconds. You get your own URL.

That's it. The tool is yours — no limits, you pay only what you use on Anthropic.

### Watch the deploy walkthrough

A 10-minute screen recording covers the whole flow. [Watch it here](#loom-coming-soon) *(link added when the kit's Looms are released).*

---

## What you'll spend on your own deploy

- ~**$0.008 – $0.020 per voice check** depending on voice doc + draft length
- ~**$10 – $25/month** for typical agency use (a few checks per day across clients)
- No subscription. You pay Anthropic directly.

---

## Customize the tool

Two suggested customizations:

### Tune what gets flagged

Open `src/prompts/system.ts`. The system prompt defines what gets flagged and how the score is computed. Loosen or tighten the strictness, add your own scoring bands, change the cited-rule format.

### Add per-client voice presets

The fixtures in `src/fixtures/studio-north.ts` are demo content. Replace them with your real client voice docs to skip the paste step.

### Upgrade to polished UI

The kit's **Bump #1 — Claude Design Polish Guide** ($17) walks you through styling this repo with [Claude Design](https://claude.com/design). *(Available after kit purchase.)*

---

## Local dev

```sh
git clone https://github.com/Voxlabs-Live/brand-voice-checker
cd brand-voice-checker
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
npm run dev
```

Then open `http://localhost:4321`.

---

## Tech

- **Astro 5** + TypeScript strict mode
- **`@anthropic-ai/sdk`** with prompt caching on the system prompt
- **Claude Sonnet 4.6** as default model
- **Vercel** for hosting + serverless API route
- **Upstash Redis** (via Vercel Marketplace) for the hosted demo's lifetime cap — disabled on your own deploy

---

## Part of the kit

| Tool | Repo |
|---|---|
| Brief Translator | [Voxlabs-Live/brief-translator](https://github.com/Voxlabs-Live/brief-translator) |
| **Brand Voice Checker** | this repo |
| Weekly Hook Sheet Generator | coming next |
| Shot List Generator | coming next |

---

## License

MIT for the code. The system prompts (`src/prompts/system.ts`) are part of the kit product — you can modify them for your own use, but please don't redistribute the prompts unchanged as a competing product.
