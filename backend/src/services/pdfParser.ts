import { extractText, getDocumentProxy } from "unpdf";

export async function parsePdf(fileBuffer: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(fileBuffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}
