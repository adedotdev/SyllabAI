import { openai, GENERATION_MODEL } from "./openaiClient.js";
import { extractionJsonSchema, extractionZodSchema, type SyllabusExtraction } from "../schemas/extraction.schema.js";

const SYSTEM_PROMPT = `You extract structured data from a course syllabus. Only extract
information that is actually present in the text. If a field cannot be determined,
use null (for nullable fields) or omit the item entirely (for list entries with no
real content). Do not invent dates, names, or policies that aren't in the syllabus.`;

export async function extractStructuredData(rawText: string): Promise<SyllabusExtraction> {
  const response = await openai.chat.completions.create({
    model: GENERATION_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: rawText },
    ],
    response_format: {
      type: "json_schema",
      json_schema: extractionJsonSchema,
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Extraction returned no content");

  return extractionZodSchema.parse(JSON.parse(content));
}
