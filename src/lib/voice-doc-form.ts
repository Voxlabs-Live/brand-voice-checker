/**
 * Voice doc form mounting + state management.
 *
 * The VoiceDocForm.astro component renders the HTML scaffold. This module
 * wires up the interactive behavior: repeating-row sections, change
 * propagation, and read/set helpers the parent page uses.
 *
 * Architecture: the form is "uncontrolled" in React parlance — DOM is the
 * source of truth. setDoc() writes to inputs; readDoc() reconstructs the
 * VoiceDoc from inputs. A 'doc-change' CustomEvent fires on every input so
 * the parent can recompute the strength meter live.
 */
import {
  emptyVoiceDoc,
  type VoiceDoc,
  type BannedWord,
  type RequiredTerm,
  type Exception,
  type VoiceOffExample,
  type ExclamationPolicy,
  type EmojiPolicy,
} from "./voice-doc-schema";

/** Mount the form. Returns API for the parent to drive it. */
export interface FormHandle {
  setDoc(doc: VoiceDoc): void;
  readDoc(): VoiceDoc;
  /** Notifies the listener whenever a field changes. */
  onChange(handler: (doc: VoiceDoc) => void): void;
}

export function mountForm(root: HTMLElement): FormHandle {
  let currentId = "";
  let changeHandler: ((doc: VoiceDoc) => void) | null = null;

  function emitChange() {
    if (changeHandler) {
      try {
        changeHandler(readDoc());
      } catch {
        // Form may be mid-update; ignore.
      }
    }
  }

  // Wire add/remove buttons via event delegation.
  root.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const addBtn = target.closest<HTMLElement>("[data-add-row]");
    if (addBtn) {
      e.preventDefault();
      const section = addBtn.dataset.addRow!;
      addRow(root, section);
      emitChange();
      return;
    }
    const removeBtn = target.closest<HTMLElement>("[data-remove-row]");
    if (removeBtn) {
      e.preventDefault();
      const row = removeBtn.closest<HTMLElement>("[data-row]");
      if (row) {
        row.remove();
        emitChange();
      }
    }
  });

  // Propagate any input/change/blur to the change handler.
  root.addEventListener("input", emitChange);
  root.addEventListener("change", emitChange);

  function setDoc(doc: VoiceDoc): void {
    currentId = doc.id;
    setInput(root, "client_name", doc.client_name);
    setInput(root, "vertical", doc.vertical ?? "");

    setInput(root, "tone_0", doc.tone_words[0] ?? "");
    setInput(root, "tone_1", doc.tone_words[1] ?? "");
    setInput(root, "tone_2", doc.tone_words[2] ?? "");

    renderBannedWords(root, doc.banned_words);
    renderTextList(root, "cadence_rules", doc.cadence_rules);
    renderTextList(root, "voice_on_examples", doc.voice_on_examples);
    renderVoiceOff(root, doc.voice_off_examples);

    setRadio(root, "exclamation", doc.punctuation.exclamation);
    setRadio(root, "emoji", doc.punctuation.emoji);
    setInput(root, "em_dash", doc.punctuation.em_dash ?? "");
    setInput(root, "ellipsis", doc.punctuation.ellipsis ?? "");

    renderTextList(root, "cta_preferred", doc.cta.preferred ?? []);
    renderTextList(root, "cta_banned", doc.cta.banned ?? []);
    setInput(root, "cta_tone", doc.cta.tone ?? "");

    renderRequiredTerms(root, doc.required_terms);
    renderExceptions(root, doc.exceptions ?? []);
    renderTextList(root, "examples_gallery", doc.examples_gallery);
  }

  function readDoc(): VoiceDoc {
    const exclamation = (readRadio(root, "exclamation") ?? "at_most_one") as ExclamationPolicy;
    const emoji = (readRadio(root, "emoji") ?? "sparingly") as EmojiPolicy;

    return {
      id: currentId || (typeof crypto !== "undefined" ? crypto.randomUUID() : `local:${Date.now()}`),
      client_name: readInput(root, "client_name"),
      vertical: readInput(root, "vertical"),
      tone_words: [
        readInput(root, "tone_0"),
        readInput(root, "tone_1"),
        readInput(root, "tone_2"),
      ],
      banned_words: readBannedWords(root),
      cadence_rules: readTextList(root, "cadence_rules"),
      voice_on_examples: readTextList(root, "voice_on_examples"),
      voice_off_examples: readVoiceOff(root),
      punctuation: {
        exclamation,
        em_dash: readInput(root, "em_dash"),
        ellipsis: readInput(root, "ellipsis"),
        emoji,
      },
      cta: {
        preferred: readTextList(root, "cta_preferred"),
        banned: readTextList(root, "cta_banned"),
        tone: readInput(root, "cta_tone"),
      },
      required_terms: readRequiredTerms(root),
      exceptions: readExceptions(root),
      examples_gallery: readTextList(root, "examples_gallery"),
    };
  }

  function onChange(handler: (doc: VoiceDoc) => void): void {
    changeHandler = handler;
  }

  // Initialize with an empty doc so the form is editable on first render.
  setDoc(emptyVoiceDoc());

  return { setDoc, readDoc, onChange };
}

// ─── DOM helpers ────────────────────────────────────────────────────────────

function setInput(root: HTMLElement, name: string, value: string): void {
  const el = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[data-field="${name}"]`
  );
  if (el) el.value = value;
}

function readInput(root: HTMLElement, name: string): string {
  const el = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[data-field="${name}"]`
  );
  return el ? el.value.trim() : "";
}

function setRadio(root: HTMLElement, name: string, value: string): void {
  const radios = root.querySelectorAll<HTMLInputElement>(
    `input[type="radio"][name="${name}"]`
  );
  radios.forEach((r) => (r.checked = r.value === value));
}

function readRadio(root: HTMLElement, name: string): string | null {
  const checked = root.querySelector<HTMLInputElement>(
    `input[type="radio"][name="${name}"]:checked`
  );
  return checked ? checked.value : null;
}

// ─── Repeating rows ─────────────────────────────────────────────────────────

function listContainer(root: HTMLElement, section: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-list="${section}"]`);
}

function clearList(root: HTMLElement, section: string): HTMLElement | null {
  const c = listContainer(root, section);
  if (c) c.innerHTML = "";
  return c;
}

function renderBannedWords(root: HTMLElement, items: BannedWord[]): void {
  const c = clearList(root, "banned_words");
  if (!c) return;
  for (const item of items) addBannedWordRow(c, item.word, item.reason ?? "");
  if (items.length === 0) addBannedWordRow(c, "", "");
}

function readBannedWords(root: HTMLElement): BannedWord[] {
  const c = listContainer(root, "banned_words");
  if (!c) return [];
  return Array.from(c.querySelectorAll<HTMLElement>("[data-row]"))
    .map((row) => {
      const word = (row.querySelector<HTMLInputElement>('[data-row-field="word"]')?.value ?? "").trim();
      const reason = (row.querySelector<HTMLInputElement>('[data-row-field="reason"]')?.value ?? "").trim();
      return { word, reason: reason || undefined };
    })
    .filter((b) => b.word);
}

function addBannedWordRow(container: HTMLElement, word: string, reason: string): void {
  const row = document.createElement("div");
  row.className = "form-row";
  row.dataset.row = "";
  row.innerHTML = `
    <input class="input input--small" data-row-field="word" placeholder="banned word" value="${escapeAttr(word)}">
    <input class="input input--small" data-row-field="reason" placeholder="reason (optional)" value="${escapeAttr(reason)}">
    <button type="button" class="btn btn--ghost btn--small btn--icon" data-remove-row aria-label="Remove">×</button>
  `;
  container.appendChild(row);
}

function renderTextList(root: HTMLElement, section: string, items: string[]): void {
  const c = clearList(root, section);
  if (!c) return;
  const useTextarea = isTextareaSection(section);
  for (const item of items) addTextListRow(c, item, useTextarea);
  if (items.length === 0) addTextListRow(c, "", useTextarea);
}

function readTextList(root: HTMLElement, section: string): string[] {
  const c = listContainer(root, section);
  if (!c) return [];
  return Array.from(c.querySelectorAll<HTMLElement>("[data-row]"))
    .map((row) => {
      const el = row.querySelector<HTMLInputElement | HTMLTextAreaElement>('[data-row-field="text"]');
      return (el?.value ?? "").trim();
    })
    .filter((v) => v);
}

function addTextListRow(container: HTMLElement, text: string, useTextarea: boolean): void {
  const row = document.createElement("div");
  row.className = "form-row";
  row.dataset.row = "";
  const escaped = escapeAttr(text);
  if (useTextarea) {
    row.innerHTML = `
      <textarea class="input input--small" data-row-field="text" rows="2" placeholder="example">${escapeHtml(text)}</textarea>
      <button type="button" class="btn btn--ghost btn--small btn--icon" data-remove-row aria-label="Remove">×</button>
    `;
  } else {
    row.innerHTML = `
      <input class="input input--small" data-row-field="text" placeholder="rule or phrase" value="${escaped}">
      <button type="button" class="btn btn--ghost btn--small btn--icon" data-remove-row aria-label="Remove">×</button>
    `;
  }
  container.appendChild(row);
}

function isTextareaSection(section: string): boolean {
  return (
    section === "voice_on_examples" ||
    section === "examples_gallery" ||
    section === "cadence_rules"
  );
}

function renderVoiceOff(root: HTMLElement, items: VoiceOffExample[]): void {
  const c = clearList(root, "voice_off_examples");
  if (!c) return;
  for (const item of items) addVoiceOffRow(c, item.example, item.why_wrong);
  if (items.length === 0) addVoiceOffRow(c, "", "");
}

function readVoiceOff(root: HTMLElement): VoiceOffExample[] {
  const c = listContainer(root, "voice_off_examples");
  if (!c) return [];
  return Array.from(c.querySelectorAll<HTMLElement>("[data-row]"))
    .map((row) => {
      const example = (row.querySelector<HTMLTextAreaElement>('[data-row-field="example"]')?.value ?? "").trim();
      const why_wrong = (row.querySelector<HTMLInputElement>('[data-row-field="why_wrong"]')?.value ?? "").trim();
      return { example, why_wrong };
    })
    .filter((v) => v.example);
}

function addVoiceOffRow(container: HTMLElement, example: string, why_wrong: string): void {
  const row = document.createElement("div");
  row.className = "form-row form-row--stacked";
  row.dataset.row = "";
  row.innerHTML = `
    <div class="form-row__main">
      <textarea class="input input--small" data-row-field="example" rows="2" placeholder="off-brand example">${escapeHtml(example)}</textarea>
      <input class="input input--small" data-row-field="why_wrong" placeholder="why it's wrong" value="${escapeAttr(why_wrong)}">
    </div>
    <button type="button" class="btn btn--ghost btn--small btn--icon" data-remove-row aria-label="Remove">×</button>
  `;
  container.appendChild(row);
}

function renderRequiredTerms(root: HTMLElement, items: RequiredTerm[]): void {
  const c = clearList(root, "required_terms");
  if (!c) return;
  for (const item of items) addRequiredTermRow(c, item.use, item.not, item.note ?? "");
  if (items.length === 0) addRequiredTermRow(c, "", "", "");
}

function readRequiredTerms(root: HTMLElement): RequiredTerm[] {
  const c = listContainer(root, "required_terms");
  if (!c) return [];
  return Array.from(c.querySelectorAll<HTMLElement>("[data-row]"))
    .map((row) => {
      const use = (row.querySelector<HTMLInputElement>('[data-row-field="use"]')?.value ?? "").trim();
      const not = (row.querySelector<HTMLInputElement>('[data-row-field="not"]')?.value ?? "").trim();
      const note = (row.querySelector<HTMLInputElement>('[data-row-field="note"]')?.value ?? "").trim();
      return { use, not, note: note || undefined };
    })
    .filter((t) => t.use && t.not);
}

function addRequiredTermRow(container: HTMLElement, use: string, not: string, note: string): void {
  const row = document.createElement("div");
  row.className = "form-row";
  row.dataset.row = "";
  row.innerHTML = `
    <input class="input input--small" data-row-field="use" placeholder="use this" value="${escapeAttr(use)}">
    <input class="input input--small" data-row-field="not" placeholder="not this" value="${escapeAttr(not)}">
    <input class="input input--small" data-row-field="note" placeholder="context (optional)" value="${escapeAttr(note)}">
    <button type="button" class="btn btn--ghost btn--small btn--icon" data-remove-row aria-label="Remove">×</button>
  `;
  container.appendChild(row);
}

function renderExceptions(root: HTMLElement, items: Exception[]): void {
  const c = clearList(root, "exceptions");
  if (!c) return;
  for (const item of items) addExceptionRow(c, item.exception, item.when);
}

function readExceptions(root: HTMLElement): Exception[] {
  const c = listContainer(root, "exceptions");
  if (!c) return [];
  return Array.from(c.querySelectorAll<HTMLElement>("[data-row]"))
    .map((row) => {
      const exception = (row.querySelector<HTMLInputElement>('[data-row-field="exception"]')?.value ?? "").trim();
      const when = (row.querySelector<HTMLInputElement>('[data-row-field="when"]')?.value ?? "").trim();
      return { exception, when };
    })
    .filter((e) => e.exception);
}

function addExceptionRow(container: HTMLElement, exception: string, when: string): void {
  const row = document.createElement("div");
  row.className = "form-row";
  row.dataset.row = "";
  row.innerHTML = `
    <input class="input input--small" data-row-field="exception" placeholder="exception" value="${escapeAttr(exception)}">
    <input class="input input--small" data-row-field="when" placeholder="when does it apply" value="${escapeAttr(when)}">
    <button type="button" class="btn btn--ghost btn--small btn--icon" data-remove-row aria-label="Remove">×</button>
  `;
  container.appendChild(row);
}

function addRow(root: HTMLElement, section: string): void {
  const container = listContainer(root, section);
  if (!container) return;
  switch (section) {
    case "banned_words":
      addBannedWordRow(container, "", "");
      break;
    case "voice_off_examples":
      addVoiceOffRow(container, "", "");
      break;
    case "required_terms":
      addRequiredTermRow(container, "", "", "");
      break;
    case "exceptions":
      addExceptionRow(container, "", "");
      break;
    default:
      addTextListRow(container, "", isTextareaSection(section));
      break;
  }
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
