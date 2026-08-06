import path from "node:path";
import { parsePdf } from "./pdfParser.js";
import { parseDocx } from "./docxParser.js";

export const SUPPORTED_EXTENSIONS = [".pdf", ".docx"] as const;

export async function parseDocument(filePath: string, fileBuffer: Buffer): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".pdf":
      return parsePdf(fileBuffer);
    case ".docx":
      return parseDocx(fileBuffer);
    default:
      throw new Error(`Unsupported file extension: ${ext}`);
  }
}
