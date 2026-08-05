import { openai, GENERATION_MODEL } from "./openaiClient.js";

export const structuredIntents = ["deadline", "grading", "office_hours"] as const;
export type StructuredIntent = (typeof structuredIntents)[number];
export type QuestionIntent = StructuredIntent | "open_ended";

export interface QuestionClassification {
  intent: QuestionIntent;
  entity: string | null;
}

const ROUTER_JSON_SCHEMA = {
  name: "question_classification",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      intent: {
        type: "string",
        enum: ["deadline", "grading", "office_hours", "open_ended"],
      },
      entity: {
        type: ["string", "null"],
        description:
          "The specific thing being asked about, e.g. 'midterm' or 'homework 3'. Null for open_ended questions.",
      },
    },
    required: ["intent", "entity"],
  },
  strict: true,
} as const;

const SYSTEM_PROMPT = `Classify a student's question about a course syllabus into one of:
- "deadline": asking when something is due (exam, assignment, quiz, project)
- "grading": asking about grading weights/breakdown
- "office_hours": asking when/where office hours are
- "open_ended": anything else (policies, general questions, ambiguous questions)

Extract the specific entity being asked about (e.g. "midterm", "final project") when relevant.`;

export async function classifyQuestion(question: string): Promise<QuestionClassification> {
  const response = await openai.chat.completions.create({
    model: GENERATION_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: question },
    ],
    response_format: {
      type: "json_schema",
      json_schema: ROUTER_JSON_SCHEMA,
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return { intent: "open_ended", entity: null };

  return JSON.parse(content) as QuestionClassification;
}
