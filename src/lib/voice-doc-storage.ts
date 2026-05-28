/**
 * localStorage persistence for VoiceDoc objects.
 *
 * Browser-only. The /api/check endpoint receives the full VoiceDoc JSON in
 * the request body — the server never reads from localStorage. This keeps
 * the buyer's fork stateless (no DB, no operational dependency).
 *
 * On first load we seed with three built-in samples (Aurelia, Mantra,
 * Eckhardt) so the demo Just Works. Built-in samples have id prefixed with
 * `sample:` so we can distinguish them from user-created docs in the picker.
 */
import type { VoiceDoc } from "./voice-doc-schema";

const STORAGE_KEY = "bvc:voice-docs:v1";
const SEEDED_FLAG_KEY = "bvc:voice-docs:seeded:v1";

export const SAMPLE_ID_PREFIX = "sample:";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readAll(): VoiceDoc[] {
  if (!isBrowser()) return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as VoiceDoc[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(docs: VoiceDoc[]): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
}

/** List all saved docs, sample docs first then user-created (by name). */
export function listDocs(): VoiceDoc[] {
  const all = readAll();
  return [...all].sort((a, b) => {
    const aSample = a.id.startsWith(SAMPLE_ID_PREFIX);
    const bSample = b.id.startsWith(SAMPLE_ID_PREFIX);
    if (aSample !== bSample) return aSample ? -1 : 1;
    return a.client_name.localeCompare(b.client_name);
  });
}

export function getDoc(id: string): VoiceDoc | undefined {
  return readAll().find((d) => d.id === id);
}

/** Save (insert or update). Sets updated_at. */
export function saveDoc(doc: VoiceDoc): VoiceDoc {
  const stamped: VoiceDoc = { ...doc, updated_at: new Date().toISOString() };
  const all = readAll();
  const idx = all.findIndex((d) => d.id === stamped.id);
  if (idx >= 0) all[idx] = stamped;
  else all.push(stamped);
  writeAll(all);
  return stamped;
}

export function deleteDoc(id: string): void {
  writeAll(readAll().filter((d) => d.id !== id));
}

/** Duplicate an existing doc (with a new id and "(copy)" suffix). */
export function duplicateDoc(id: string): VoiceDoc | undefined {
  const source = getDoc(id);
  if (!source) return undefined;
  const copy: VoiceDoc = {
    ...JSON.parse(JSON.stringify(source)),
    id: crypto.randomUUID(),
    client_name: `${source.client_name} (copy)`,
  };
  return saveDoc(copy);
}

/**
 * Seed the storage with built-in samples on first visit. Idempotent — uses
 * a one-time flag so re-seeding doesn't overwrite user edits to sample docs.
 */
export function seedSamplesIfNeeded(samples: VoiceDoc[]): void {
  if (!isBrowser()) return;
  if (window.localStorage.getItem(SEEDED_FLAG_KEY) === "1") return;
  const existing = readAll();
  const existingIds = new Set(existing.map((d) => d.id));
  const toAdd = samples.filter((s) => !existingIds.has(s.id));
  if (toAdd.length > 0) writeAll([...existing, ...toAdd]);
  window.localStorage.setItem(SEEDED_FLAG_KEY, "1");
}
