// PDF resume handling: validation and text extraction.
// Uses Mozilla's pdf.js (pdfjs-dist) for extraction. Files are validated by
// size, extension, magic bytes, and by successfully parsing them server-side.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { normalizeWhitespace } from "../utils/helpers.js";

export const MAX_RESUME_BYTES = 5 * 1024 * 1024; // 5 MB
const MIN_EXTRACTED_CHARS = 40; // reject PDFs that yield essentially no text

/** Thrown when an uploaded file is not an acceptable PDF resume. */
export class ResumeValidationError extends Error {}

/** Check the PDF magic number. Tolerates leading whitespace/BOM bytes. */
export function validatePdfHeader(headBytes) {
  return headBytes.subarray(0, 1024).includes(Buffer.from("%PDF-"));
}

/**
 * Validate and persist an uploaded PDF (multer memory-storage file object).
 * Returns { storageName, storagePath }. The storage filename is generated
 * server-side; the client's filename is never trusted for storage.
 */
export function saveUpload(file, uploadFolder) {
  if (!file || !file.originalname) {
    throw new ResumeValidationError("A PDF resume is required.");
  }
  const original = file.originalname || "";
  if (!original.toLowerCase().endsWith(".pdf")) {
    throw new ResumeValidationError("Only PDF files are accepted.");
  }
  const data = file.buffer || Buffer.alloc(0);
  if (!validatePdfHeader(data)) {
    throw new ResumeValidationError(
      "The uploaded file is not a valid PDF (missing PDF header)."
    );
  }
  if (data.length === 0) {
    throw new ResumeValidationError("The uploaded file is empty.");
  }
  if (data.length > MAX_RESUME_BYTES) {
    throw new ResumeValidationError("The resume exceeds the 5 MB size limit.");
  }

  const storageName = `${crypto.randomBytes(16).toString("hex")}.pdf`;
  fs.mkdirSync(uploadFolder, { recursive: true });
  const dest = path.join(uploadFolder, storageName);
  fs.writeFileSync(dest, data);
  return { storageName, storagePath: dest };
}

/**
 * Extract and normalise text from a PDF file.
 * Throws ResumeValidationError when the file cannot be parsed or contains
 * too little extractable text (e.g. a scanned image PDF).
 */
export async function extractText(pdfPath) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

  let doc;
  try {
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const task = getDocument({
      data,
      isEvalSupported: false,
      useSystemFonts: true,
      verbosity: 0,
    });
    doc = await task.promise;
  } catch {
    throw new ResumeValidationError("The PDF could not be opened.");
  }

  try {
    if (doc.numPages === 0) {
      throw new ResumeValidationError("The PDF could not be opened.");
    }
    const chunks = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map((item) => item.str || "");
      chunks.push(strings.join(" "));
    }
    const raw = chunks.join("\n");
    const text = normalizeWhitespace(raw);
    if (text.length < MIN_EXTRACTED_CHARS) {
      throw new ResumeValidationError(
        "Almost no text could be extracted from this PDF. " +
          "Please upload a text-based resume (not a scanned image)."
      );
    }
    return text;
  } catch (err) {
    if (err instanceof ResumeValidationError) throw err;
    throw new ResumeValidationError("The PDF could not be opened.");
  } finally {
    try {
      await doc.destroy();
    } catch {
      /* ignore */
    }
  }
}

/** Return a short excerpt of `text` around the first match of `term`. */
export function snippetAround(text, term, radius = 60) {
  if (!text || !term) return null;
  const haystack = String(text);
  const needle = String(term);
  const idx = haystack.toLowerCase().indexOf(needle.toLowerCase());
  if (idx === -1) return null;
  const start = Math.max(0, idx - radius);
  const end = Math.min(haystack.length, idx + needle.length + radius);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < haystack.length ? "..." : "";
  return `${prefix}${haystack.slice(start, end).trim()}${suffix}`;
}
