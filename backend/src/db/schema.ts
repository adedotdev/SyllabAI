import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  numeric,
  date,
  jsonb,
  vector,
  index,
} from "drizzle-orm/pg-core";

export const syllabusStatusValues = [
  "uploaded",
  "processing",
  "ready",
  "failed",
] as const;
export type SyllabusStatus = (typeof syllabusStatusValues)[number];

export const syllabi = pgTable("syllabi", {
  id: uuid("id").primaryKey().defaultRandom(),
  filename: text("filename").notNull(),
  filePath: text("file_path").notNull(),
  rawText: text("raw_text"),
  status: text("status").$type<SyllabusStatus>().notNull().default("uploaded"),
  chunkingError: text("chunking_error"),
  extractionError: text("extraction_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const deadlineCategoryValues = [
  "exam",
  "assignment",
  "quiz",
  "project",
  "other",
] as const;
export type DeadlineCategory = (typeof deadlineCategoryValues)[number];

export const syllabusDeadlines = pgTable("syllabus_deadlines", {
  id: uuid("id").primaryKey().defaultRandom(),
  syllabusId: uuid("syllabus_id")
    .notNull()
    .references(() => syllabi.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  category: text("category").$type<DeadlineCategory>().notNull().default("other"),
  dueDate: date("due_date"),
  dueDateText: text("due_date_text").notNull(),
  sourceExcerpt: text("source_excerpt"),
});

export const syllabusGradingWeights = pgTable("syllabus_grading_weights", {
  id: uuid("id").primaryKey().defaultRandom(),
  syllabusId: uuid("syllabus_id")
    .notNull()
    .references(() => syllabi.id, { onDelete: "cascade" }),
  componentName: text("component_name").notNull(),
  weightPercent: numeric("weight_percent", { precision: 5, scale: 2 }),
});

export const syllabusExtracted = pgTable("syllabus_extracted", {
  syllabusId: uuid("syllabus_id")
    .primaryKey()
    .references(() => syllabi.id, { onDelete: "cascade" }),
  officeHours: jsonb("office_hours"),
  policies: jsonb("policies"),
  rawExtraction: jsonb("raw_extraction"),
});

// text-embedding-3-small produces 1536-dimensional vectors.
export const EMBEDDING_DIMENSIONS = 1536;

export const syllabusChunks = pgTable(
  "syllabus_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    syllabusId: uuid("syllabus_id")
      .notNull()
      .references(() => syllabi.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    sectionTitle: text("section_title"),
    content: text("content").notNull(),
    tokenCount: integer("token_count").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // HNSW over IVFFlat: builds incrementally with no separate training/ANALYZE
    // step, which matters more than raw query speed at MVP row counts (low
    // thousands of chunks). IVFFlat's `lists` parameter needs tuning to row
    // count that we don't know in advance.
    index("syllabus_chunks_embedding_hnsw_idx")
      .using("hnsw", table.embedding.op("vector_cosine_ops")),
  ],
);
