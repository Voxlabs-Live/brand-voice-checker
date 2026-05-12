import { Redis } from "@upstash/redis";
import { createHash } from "node:crypto";

/**
 * Lifetime per-IP demo rate limit. Each demo deploy is configured for 5 runs
 * total per (IP + User-Agent) hash, with NO renewal — once exhausted, the
 * caller sees the fork-CTA wall.
 *
 * For tool repos the buyer forks: this module is included but the limit is
 * disabled by setting DEMO_MODE=false (or not setting it at all). The buyer's
 * own deploy never enforces this.
 *
 * Storage: Upstash Redis. We read credentials explicitly rather than using
 * Redis.fromEnv() because Vercel's Marketplace integration injects env vars
 * with the pattern {PREFIX}_KV_REST_API_URL / {PREFIX}_KV_REST_API_TOKEN —
 * NOT the bare UPSTASH_REDIS_REST_URL / TOKEN that fromEnv() expects. Reading
 * both shapes means the code works whether you connect Upstash via Vercel
 * Marketplace or set the standard env vars manually (e.g., in .env.local).
 */
export const DEMO_LIMIT = 5;
export const KV_PREFIX = "vibekit:demo:";

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

let _redis: Redis | null = null;
function redis(): Redis {
  if (_redis) return _redis;
  const url =
    process.env.UPSTASH_REDIS_REST_URL ??
    process.env.UPSTASH_REDIS_REST_KV_REST_API_URL ??
    process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ??
    process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN ??
    process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error(
      "Upstash Redis env vars not found. Expected UPSTASH_REDIS_REST_URL / " +
        "UPSTASH_REDIS_REST_TOKEN, or Vercel Marketplace's " +
        "UPSTASH_REDIS_REST_KV_REST_API_URL / *_TOKEN."
    );
  }
  _redis = new Redis({ url, token });
  return _redis;
}

function hashKey(ip: string, ua: string): string {
  return createHash("sha256")
    .update(`${ip}::${ua}`)
    .digest("hex")
    .slice(0, 16);
}

export interface DemoUsage {
  count: number;
  remaining: number;
  exceeded: boolean;
}

/**
 * Returns current usage. Does NOT increment — call `consumeDemo` AFTER the
 * Anthropic call succeeds so failed calls don't burn the buyer's budget.
 */
export async function readDemo(req: Request): Promise<DemoUsage> {
  if (!isDemoMode()) {
    return { count: 0, remaining: Infinity, exceeded: false };
  }
  const ip = clientIp(req);
  const ua = req.headers.get("user-agent") ?? "unknown";
  const key = `${KV_PREFIX}${hashKey(ip, ua)}`;
  const count = ((await redis().get<number>(key)) ?? 0) as number;
  return {
    count,
    remaining: Math.max(0, DEMO_LIMIT - count),
    exceeded: count >= DEMO_LIMIT,
  };
}

export async function consumeDemo(req: Request): Promise<void> {
  if (!isDemoMode()) return;
  const ip = clientIp(req);
  const ua = req.headers.get("user-agent") ?? "unknown";
  const key = `${KV_PREFIX}${hashKey(ip, ua)}`;
  await redis().incr(key);
}

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "0.0.0.0";
}
