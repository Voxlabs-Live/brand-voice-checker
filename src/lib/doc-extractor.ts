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
      return {
        ok: false,
        error: "no_extractable_text",
        message:
          "No text could be extracted. The file may be scanned or password-protected.",
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
  const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
  return result.value;
}
