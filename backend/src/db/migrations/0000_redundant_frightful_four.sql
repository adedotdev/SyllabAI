CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "syllabi" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" text NOT NULL,
	"file_path" text NOT NULL,
	"raw_text" text,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"chunking_error" text,
	"extraction_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "syllabus_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"syllabus_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"section_title" text,
	"content" text NOT NULL,
	"token_count" integer NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "syllabus_deadlines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"syllabus_id" uuid NOT NULL,
	"title" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"due_date" date,
	"due_date_text" text NOT NULL,
	"source_excerpt" text
);
--> statement-breakpoint
CREATE TABLE "syllabus_extracted" (
	"syllabus_id" uuid PRIMARY KEY NOT NULL,
	"office_hours" jsonb,
	"policies" jsonb,
	"raw_extraction" jsonb
);
--> statement-breakpoint
CREATE TABLE "syllabus_grading_weights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"syllabus_id" uuid NOT NULL,
	"component_name" text NOT NULL,
	"weight_percent" numeric(5, 2)
);
--> statement-breakpoint
ALTER TABLE "syllabus_chunks" ADD CONSTRAINT "syllabus_chunks_syllabus_id_syllabi_id_fk" FOREIGN KEY ("syllabus_id") REFERENCES "public"."syllabi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "syllabus_deadlines" ADD CONSTRAINT "syllabus_deadlines_syllabus_id_syllabi_id_fk" FOREIGN KEY ("syllabus_id") REFERENCES "public"."syllabi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "syllabus_extracted" ADD CONSTRAINT "syllabus_extracted_syllabus_id_syllabi_id_fk" FOREIGN KEY ("syllabus_id") REFERENCES "public"."syllabi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "syllabus_grading_weights" ADD CONSTRAINT "syllabus_grading_weights_syllabus_id_syllabi_id_fk" FOREIGN KEY ("syllabus_id") REFERENCES "public"."syllabi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "syllabus_chunks_embedding_hnsw_idx" ON "syllabus_chunks" USING hnsw ("embedding" vector_cosine_ops);