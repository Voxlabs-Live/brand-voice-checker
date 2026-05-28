/**
 * Document text extractor. Converts an uploaded file (PDF / DOCX / TXT / MD)
 * into plain text the section detector can read.
 *
 * Pure server-side. unpdf and mammoth both work in serverless environments;
 * they're loaded dynamically so the import cost only hits the /api/import-doc
 * route, not the homepage bundle.
 *
 * Failure modes are returned as a typed result rather than thrown — the
 * upload endpoint surfaces these directly to the user.
 */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB

export type ExtractError =
  | "unsupported_type"
  | "file_too_large"
  | "empty_file"
  | "no_extractable_text"
  | "parse_failed";

export interface ExtractSuccess {
  ok: true;
  text: string;
  /** Original filename, useful for the saved doc's client_name fallback. */
  filename: string;
  /** Format that was detected. */
  format: "pdf" | "docx" | "markdown" | "text";
}

export interface ExtractFailure {
  ok: false;
  error: ExtractError;
  message: string;
}

export type ExtractResult = ExtractSuccess | ExtractFailure;

/** Map filename + mime to a known format, or null if unsupported. */
function detectFormat(
  filename: string,
  mimeType: string
): "pdf" | "docx" | "markdown" | "text" | null {
  const lower = filename.toLowerCase();
  const mime = mimeType.toLowerCase();
  if (lower.endsWith(".pdf") || mime === "application/pdf") return "pdf";
  if (
    lower.endsWith(".docx") ||
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return "docx";
  if (lower.endsWith(".md") || lower.endsWith(".markdown") || mime === "text/markdown")
    return "markdown";
  if (lower.endsWith(".txt") || mime === "text/plain") return "text";
  return null;
}

export async function extractDocument(file: File): Promise<ExtractResult> {
  if (file.size === 0) {
    return { ok: false, error: "empty_file", message: "Uploaded file is empty." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: "file_too_large",
      message: `File exceeds the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB limit.`,
    };
  }
  const format = detectFormat(file.name, file.type);
  if (!format) {
    return {
      ok: false,
      error: "unsupported_type",
      message: "Supported types: PDF, DOCX, MD, TXT.",
    };
  }

  try {
    const buffer = new Uint8Array(await file.arrayBuffer());
    let text = "";
    switch (format) {
      case "pdf":
        text = await extractPdf(buffer);
        break;
      case "docx":
        text = await extractDocx(buffer);
        break;
      case "markdown":
      case "text":
        text = new TextDecoder("utf-8").decode(buffer);
        break;
    }
    text = text.trim();
    if (!text) {
      // PDFs that parse successfully but yield no text are almost always
      // scanned images — surface that case with an actionable next step.
      if (format === "pdf") {
        return {
          ok: false,
          error: "no_extractable_text",
          message:
            "Looks like a scanned PDF — no selectable text inside. Try re-exporting from the source doc (Word / Google Docs / Pages), or use your OS preview to export as text first, then upload that.",
        };
      }
      return {
        ok: false,
        error: "no_extractable_text",
        message:
          "No text could be extracted. The file may be empty or password-protected.",
      };
    }
    return { ok: true, text, filename: file.name, format };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: "parse_failed",
      message: `Could not parse the file: ${message}`,
    };
  }
}

async function extractPdf(buffer: Uint8Array): Promise<string> {
  const { extractText } = await import("unpdf");
  const result = await extractText(buffer, { mergePages: true });
  const text = Array.isArray(result.text) ? result.text.join("\n") : result.text;
  return typeof text === "string" ? text : "";
}

async function extractDocx(buffer: Uint8Array): Promise<string> {
  const mammoth = await import("mammoth");
  // convertToHtml preserves heading levels, lists, and blockquotes — structure
  // the section-detector and field-extractor depend on. extractRawText flattens
  // everything to bare paragraphs, which dropped DOCX detection to ~5/10.
  // Heading preservation requires the docx to use heading STYLES (not just
  // bold text); python-docx-generated test fixtures may not always preserve
  // these. If convertToHtml returns no headings, we'll still have paragraphs
  // and lists.
  const result = await mammoth.convertToHtml({ buffer: Buffer.from(buffer) });
  return htmlToMarkdownLike(result.value);
}

/**
 * Minimal HTML→markdown-like converter targeted at mammoth's docx output.
 * Preserves heading levels, lists, and blockquotes so the section detector
 * and field extractor (which look for `## `, `- `, `> `) work on .docx
 * uploads as well as on native .md.
 *
 * Not a general-purpose HTML→markdown converter. Only handles tags mammoth
 * actually emits: h1-h6, p, ul, ol, li, blockquote, strong/b, em/i, br.
 */
function htmlToMarkdownLike(html: string): string {
  let s = html;

  // Normalize self-closing breaks and remove style/script defensively.
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/?(script|style)[^>]*>/gi, "");

  // Inline formatting — convert before block tags so the markers survive.
  s = s.replace(/<\/?(strong|b)>/gi, "**");
  s = s.replace(/<\/?(em|i)>/gi, "_");
  s = s.replace(/<code>([\s\S]*?)<\/code>/gi, (_m, inner) => "`" + inner + "`");

  // Headings → `## Heading` with surrounding blank lines.
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, level, inner) => {
    const hashes = "#".repeat(Number(level));
    return `\n\n${hashes} ${stripTags(inner).trim()}\n\n`;
  });

  // List items — convert <ol>/<ul> wrappers to nothing, mark each <li> as `- `.
  // Numbered vs bulleted distinction doesn't matter to the field extractor
  // (extractBulletLines accepts both), so collapse both to `-`.
  s = s.replace(/<\/?(ul|ol)[^>]*>/gi, "\n");
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, inner) => {
    return `- ${stripTags(inner).trim()}\n`;
  });

  // Blockquotes — prefix every line of the inner content with `> `.
  s = s.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_m, inner) => {
    const text = stripTags(inner).trim();
    const lines = text.split(/\n+/).map((l) => `> ${l.trim()}`).filter((l) => l !== "> ");
    return `\n\n${lines.join("\n")}\n\n`;
  });

  // Paragraphs → text + blank line.
  s = s.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_m, inner) => `${stripTags(inner).trim()}\n\n`);

  // Strip any other tags we didn't handle, decode common entities, collapse
  // runs of blank lines.
  s = stripTags(s);
  s = decodeEntities(s);
  s = s.replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&hellip;/g, "…");
}
