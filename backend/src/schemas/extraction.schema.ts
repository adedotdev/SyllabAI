import { z } from "zod";

export const extractionZodSchema = z.object({
  deadlines: z.array(
    z.object({
      title: z.string(),
      category: z.enum(["exam", "assignment", "quiz", "project", "other"]),
      dueDate: z.string().nullable().describe("ISO date (YYYY-MM-DD) if resolvable, else null"),
      dueDateText: z.string().describe("The due date exactly as written in the syllabus"),
      sourceExcerpt: z.string().describe("Short excerpt supporting this extraction"),
    }),
  ),
  gradingWeights: z.array(
    z.object({
      componentName: z.string(),
      weightPercent: z.number().nullable(),
    }),
  ),
  officeHours: z.array(
    z.object({
      day: z.string(),
      startTime: z.string().nullable(),
      endTime: z.string().nullable(),
      location: z.string().nullable(),
      instructor: z.string().nullable(),
    }),
  ),
  policies: z.array(
    z.object({
      topic: z.string().describe("e.g. late_policy, attendance, academic_integrity"),
      text: z.string(),
    }),
  ),
});

export type SyllabusExtraction = z.infer<typeof extractionZodSchema>;

// OpenAI's json_schema response_format wants a plain JSON Schema object, not a
// zod schema, and requires every property in "required" with no optional
// fields — nullable fields model absence instead of omission.
export const extractionJsonSchema = {
  name: "syllabus_extraction",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      deadlines: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            category: {
              type: "string",
              enum: ["exam", "assignment", "quiz", "project", "other"],
            },
            dueDate: { type: ["string", "null"] },
            dueDateText: { type: "string" },
            sourceExcerpt: { type: "string" },
          },
          required: ["title", "category", "dueDate", "dueDateText", "sourceExcerpt"],
        },
      },
      gradingWeights: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            componentName: { type: "string" },
            weightPercent: { type: ["number", "null"] },
          },
          required: ["componentName", "weightPercent"],
        },
      },
      officeHours: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            day: { type: "string" },
            startTime: { type: ["string", "null"] },
            endTime: { type: ["string", "null"] },
            location: { type: ["string", "null"] },
            instructor: { type: ["string", "null"] },
          },
          required: ["day", "startTime", "endTime", "location", "instructor"],
        },
      },
      policies: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            topic: { type: "string" },
            text: { type: "string" },
          },
          required: ["topic", "text"],
        },
      },
    },
    required: ["deadlines", "gradingWeights", "officeHours", "policies"],
  },
  strict: true,
} as const;
