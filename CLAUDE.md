# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from the repo root using npm workspaces (`backend`, `frontend`).

```bash
npm install                              # installs both workspaces
cp .env.example .env                     # then fill in OPENAI_API_KEY
docker compose up -d                     # starts Postgres (pgvector/pgvector:pg16) on :5433 (remapped from 5432 -- see docker-compose.yml)
npm run db:migrate                       # applies migrations in backend/src/db/migrations (incl. CREATE EXTENSION vector)
npm run dev:backend                      # Express API on :4000 (tsx watch)
npm run dev:frontend                     # Vite dev server on :5173, proxies /api -> :4000
npm run build                            # builds backend (tsc) then frontend (vite build)
```

Backend-only commands (run from `backend/`, or via `--workspace backend` from root):
- `npm run db:generate` — regenerate a drizzle-kit migration after editing `src/db/schema.ts`. drizzle-kit does not model `CREATE EXTENSION`, so after generating a migration that adds/changes the `vector` column, manually re-add `CREATE EXTENSION IF NOT EXISTS vector;` as the first statement if drizzle-kit produced a fresh file without it.
- `npx tsc --noEmit -p tsconfig.json` — typecheck without emitting.

Frontend-only: `npx tsc -b` for a project-reference typecheck.

There is no test suite yet.

## Architecture

This is a from-scratch rebuild of a hackathon syllabus-Q&A tool, redesigned around two ideas: **real retrieval** (chunk + embed + pgvector search, not "stuff the whole PDF in the prompt") and **structured extraction** (a one-time GPT pass that normalizes deadlines/grading/office-hours into Postgres so deterministic questions skip the LLM entirely). Calendar export, multi-syllabus workspaces, and an eval harness are deliberately deferred — see `PLANNING.md`.

### Two independent pipelines, one shared input

Both pipelines start from the same parsed document text (`syllabi.raw_text`) and run **in parallel** via `Promise.allSettled` in `backend/src/services/ingestionPipeline.ts` — they don't depend on each other's output, so a failure or slowness in one doesn't block the other, and either can be re-run alone later. `documentParser.ts` dispatches to `pdfParser.ts` (`unpdf`) or `docxParser.ts` (`mammoth`) based on the uploaded file's extension — upload validation in `routes/syllabi.ts` checks the same extension list (`SUPPORTED_EXTENSIONS`) rather than trusting the browser-reported mimetype, since `.docx` mimetypes are reported inconsistently.

1. **Chunk + embed pass** (`chunker.ts` → `embeddings.ts` → `syllabus_chunks` table): splits on recognized syllabus headings (Grading, Schedule, Policies, Office Hours, etc.), then recursively token-splits oversized sections (~300 tokens, ~50 overlap) via `gpt-tokenizer`, batch-embeds via `text-embedding-3-small`, stores each chunk with its `embedding vector(1536)` column.
2. **Structured extraction pass** (`extraction.ts` + `schemas/extraction.schema.ts`): one `gpt-4o-mini` call with `response_format: json_schema` (strict) producing deadlines/gradingWeights/officeHours/policies, fanned out into `syllabus_deadlines`, `syllabus_grading_weights`, and the JSONB catch-all `syllabus_extracted`.

`syllabi.status` moves `uploaded → processing → ready|failed`; the frontend polls `GET /api/syllabi/:id` until it settles. `chunking_error`/`extraction_error` record which pass failed independently of the other.

### Query-time routing: structured lookup first, RAG as fallback

`backend/src/services/router.ts` classifies each incoming question with a cheap `gpt-4o-mini` call into `deadline | grading | office_hours | open_ended` plus an optional `entity` (e.g. "midterm"). `backend/src/services/retrieval.ts` then:
- For the three structured intents: `ILIKE`-matches `entity` against the normalized tables and returns a templated answer with **no generation call** if it finds a confident match.
- Falls through to RAG (embed the question, pgvector cosine search via `drizzle-orm`'s `cosineDistance` helper over `syllabus_chunks`, top-5 above a similarity threshold, then a grounded `gpt-4o-mini` generation call) whenever the intent is `open_ended` or the structured lookup misses.

The `/ask` response always includes `routing: "structured" | "rag"` and a `sources` array — this is deliberate so the retrieval mechanics are visible in the UI/API rather than a black box, and so a future eval harness can score it.

### Schema shape (`backend/src/db/schema.ts`)

Structured, point-queryable facts (`syllabus_deadlines`, `syllabus_grading_weights`) are separate tables from less queryable structured data (`syllabus_extracted`, JSONB), which is separate again from the vector store (`syllabus_chunks`). This split is what lets the router hit a normalized column directly instead of going through the LLM/vector path for deterministic questions. The `syllabus_chunks.embedding` column uses an **HNSW** index (not IVFFlat) specifically because HNSW needs no `lists` tuning or `ANALYZE` step at unknown/small row counts — see the comment above the index definition in schema.ts before changing it.

### Env loading

Both `backend/src/env.ts` and `backend/drizzle.config.ts` load `.env` from the **repo root** (not `backend/`) via an explicit path, since npm workspace scripts run with `cwd` set to the workspace directory. Keep a single root `.env`, not a `backend/.env`.
