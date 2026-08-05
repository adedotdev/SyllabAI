import { and, cosineDistance, desc, eq, gt, ilike, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { syllabusChunks, syllabusDeadlines, syllabusGradingWeights } from "../db/schema.js";
import { openai, GENERATION_MODEL } from "./openaiClient.js";
import { embedText } from "./embeddings.js";
import { classifyQuestion, type StructuredIntent } from "./router.js";

export type Source =
  | { type: "deadline"; title: string; dueDate: string | null }
  | { type: "grading"; componentName: string; weightPercent: string | null }
  | { type: "chunk"; sectionTitle: string | null; excerpt: string };

export interface AskResult {
  answer: string;
  routing: "structured" | "rag";
  sources: Source[];
}

const TOP_K = 5;
const SIMILARITY_THRESHOLD = 0.3;

async function tryStructuredLookup(
  syllabusId: string,
  intent: StructuredIntent,
  entity: string | null,
): Promise<AskResult | null> {
  if (!entity) return null;
  const pattern = `%${entity}%`;

  if (intent === "deadline") {
    const [match] = await db
      .select()
      .from(syllabusDeadlines)
      .where(and(eq(syllabusDeadlines.syllabusId, syllabusId), ilike(syllabusDeadlines.title, pattern)));
    if (!match) return null;
    const when = match.dueDate ?? match.dueDateText;
    return {
      answer: `${match.title} is due ${when}${match.sourceExcerpt ? `, based on the syllabus: "${match.sourceExcerpt}"` : "."}`,
      routing: "structured",
      sources: [{ type: "deadline", title: match.title, dueDate: match.dueDate }],
    };
  }

  if (intent === "grading") {
    const [match] = await db
      .select()
      .from(syllabusGradingWeights)
      .where(and(eq(syllabusGradingWeights.syllabusId, syllabusId), ilike(syllabusGradingWeights.componentName, pattern)));
    if (!match) return null;
    return {
      answer: `${match.componentName} is worth ${match.weightPercent}% of your grade.`,
      routing: "structured",
      sources: [{ type: "grading", componentName: match.componentName, weightPercent: match.weightPercent }],
    };
  }

  // office_hours lives in the JSONB catch-all table rather than a normalized
  // one (no single deterministic column to ILIKE against per-instructor), so
  // it always falls through to the RAG path below.
  return null;
}

async function runRagPath(syllabusId: string, question: string): Promise<AskResult> {
  const queryEmbedding = await embedText(question);
  const similarity = sql<number>`1 - (${cosineDistance(syllabusChunks.embedding, queryEmbedding)})`;

  const matches = await db
    .select({
      sectionTitle: syllabusChunks.sectionTitle,
      content: syllabusChunks.content,
      similarity,
    })
    .from(syllabusChunks)
    .where(and(eq(syllabusChunks.syllabusId, syllabusId), gt(similarity, SIMILARITY_THRESHOLD)))
    .orderBy((t) => desc(t.similarity))
    .limit(TOP_K);

  const context = matches
    .map((m, i) => `[${i + 1}] ${m.sectionTitle ? `(${m.sectionTitle}) ` : ""}${m.content}`)
    .join("\n\n");

  const response = await openai.chat.completions.create({
    model: GENERATION_MODEL,
    messages: [
      {
        role: "system",
        content: `Answer the student's question using ONLY the syllabus excerpts below. If the answer
isn't in the excerpts, say you couldn't find that in the syllabus rather than guessing.

${context || "(no relevant excerpts found)"}`,
      },
      { role: "user", content: question },
    ],
  });

  return {
    answer: response.choices[0]?.message?.content ?? "I couldn't generate an answer.",
    routing: "rag",
    sources: matches.map((m) => ({ type: "chunk", sectionTitle: m.sectionTitle, excerpt: m.content.slice(0, 200) })),
  };
}

export async function answerQuestion(syllabusId: string, question: string): Promise<AskResult> {
  const { intent, entity } = await classifyQuestion(question);

  if (intent !== "open_ended") {
    const structured = await tryStructuredLookup(syllabusId, intent, entity);
    if (structured) return structured;
  }

  return runRagPath(syllabusId, question);
}
