import { eq } from "drizzle-orm";
import fs from "node:fs/promises";
import { db } from "../db/client.js";
import {
  syllabi,
  syllabusChunks,
  syllabusDeadlines,
  syllabusGradingWeights,
  syllabusExtracted,
} from "../db/schema.js";
import { parsePdf } from "./pdfParser.js";
import { chunkSyllabus } from "./chunker.js";
import { embedTexts } from "./embeddings.js";
import { extractStructuredData } from "./extraction.js";

async function runChunkingPass(syllabusId: string, rawText: string): Promise<void> {
  const chunks = chunkSyllabus(rawText);
  const embeddings = await embedTexts(chunks.map((c) => c.content));

  await db.insert(syllabusChunks).values(
    chunks.map((chunk, i) => ({
      syllabusId,
      chunkIndex: chunk.chunkIndex,
      sectionTitle: chunk.sectionTitle,
      content: chunk.content,
      tokenCount: chunk.tokenCount,
      embedding: embeddings[i],
    })),
  );
}

async function runExtractionPass(syllabusId: string, rawText: string): Promise<void> {
  const extraction = await extractStructuredData(rawText);

  if (extraction.deadlines.length > 0) {
    await db.insert(syllabusDeadlines).values(
      extraction.deadlines.map((d) => ({
        syllabusId,
        title: d.title,
        category: d.category,
        dueDate: d.dueDate,
        dueDateText: d.dueDateText,
        sourceExcerpt: d.sourceExcerpt,
      })),
    );
  }

  if (extraction.gradingWeights.length > 0) {
    await db.insert(syllabusGradingWeights).values(
      extraction.gradingWeights.map((g) => ({
        syllabusId,
        componentName: g.componentName,
        weightPercent: g.weightPercent === null ? null : String(g.weightPercent),
      })),
    );
  }

  await db.insert(syllabusExtracted).values({
    syllabusId,
    officeHours: extraction.officeHours,
    policies: extraction.policies,
    rawExtraction: extraction,
  });
}

export async function runIngestionPipeline(syllabusId: string): Promise<void> {
  const [syllabus] = await db.select().from(syllabi).where(eq(syllabi.id, syllabusId));
  if (!syllabus) throw new Error(`Syllabus ${syllabusId} not found`);

  await db.update(syllabi).set({ status: "processing", updatedAt: new Date() }).where(eq(syllabi.id, syllabusId));

  const fileBuffer = await fs.readFile(syllabus.filePath);
  const rawText = await parsePdf(fileBuffer);

  await db.update(syllabi).set({ rawText, updatedAt: new Date() }).where(eq(syllabi.id, syllabusId));

  // Both passes only depend on rawText, so they run independently: a failure
  // or slowdown in one shouldn't block the other, and either can be re-run
  // alone later without redoing the other.
  const [chunkResult, extractionResult] = await Promise.allSettled([
    runChunkingPass(syllabusId, rawText),
    runExtractionPass(syllabusId, rawText),
  ]);

  const chunkingError = chunkResult.status === "rejected" ? String(chunkResult.reason) : null;
  const extractionError = extractionResult.status === "rejected" ? String(extractionResult.reason) : null;
  const status = chunkingError || extractionError ? "failed" : "ready";

  await db
    .update(syllabi)
    .set({ status, chunkingError, extractionError, updatedAt: new Date() })
    .where(eq(syllabi.id, syllabusId));
}
