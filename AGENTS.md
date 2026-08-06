# AGENTS.md

Guidance for AI coding agents (Claude Code, Cursor, Codex, etc.) working in this repository. See also `PLANNING.md` for what's built vs. deferred, and `CLAUDE.md` for the Claude-Code-specific twin of this file (keep both in sync when architecture changes).

## Commands

Run from the repo root using npm workspaces (`backend`, `frontend`):

```bash
npm install                              # installs both workspaces
cp .env.example .env                     # then fill in OPENAI_API_KEY
docker compose up -d                     # starts Postgres (pgvector/pgvector:pg16) on :5433 (remapped from 5432 -- see docker-compose.yml)
npm run db:migrate                       # applies migrations in backend/src/db/migrations (incl. CREATE EXTENSION vector)
npm run dev:backend                      # Express API on :4000 (tsx watch)
npm run dev:frontend                     # Vite dev server on :5173, proxies /api -> :4000
npm run build                            # builds backend (tsc) then frontend (vite build)
```

`npm run db:generate` (from `backend/`) regenerates a drizzle-kit migration after editing `backend/src/db/schema.ts` — drizzle-kit doesn't model `CREATE EXTENSION`, so re-check that the first statement of any migration touching the `vector` column is still `CREATE EXTENSION IF NOT EXISTS vector;`.

There is no test suite yet.

## Architecture

This is a from-scratch rebuild of a hackathon syllabus-Q&A tool. Students upload a syllabus PDF; the system answers questions about it. The redesign is built around two ideas instead of the original's "stuff the whole PDF into the prompt" approach:

1. **Real retrieval** — chunk the syllabus, embed the chunks, and do pgvector similarity search instead of context-stuffing.
2. **Structured extraction** — a one-time GPT pass normalizes deadlines/grading weights/office hours into Postgres tables, so deterministic questions ("when's the midterm") are answered from a row lookup, not an LLM call.

Calendar export, multi-syllabus workspaces, and an eval harness are intentionally deferred (see `PLANNING.md`) — the schema and pipeline are shaped so those can be added without a rewrite.

### Ingestion: two independent passes over one parsed text

`backend/src/services/ingestionPipeline.ts` parses the uploaded document once (`raw_text`) via `documentParser.ts`, which dispatches to `pdfParser.ts` (`unpdf`) or `docxParser.ts` (`mammoth`) based on file extension, then runs two passes **in parallel** via `Promise.allSettled` — they don't depend on each other, so either can fail or be re-run without touching the other:

1. **Chunk + embed** (`chunker.ts` → `embeddings.ts` → `syllabus_chunks`): splits on recognized syllabus headings (Grading, Schedule, Policies, Office Hours, ...), recursively token-splits oversized sections (~300 tokens, ~50 overlap), embeds via `text-embedding-3-small`, stores each chunk with its `vector(1536)` embedding.
2. **Structured extraction** (`extraction.ts` + `schemas/extraction.schema.ts`): one `gpt-4o-mini` call with a strict `json_schema` response format, fanned out into `syllabus_deadlines`, `syllabus_grading_weights`, and the JSONB catch-all `syllabus_extracted`.

`syllabi.status` tracks `uploaded → processing → ready|failed`, and `chunking_error`/`extraction_error` record which pass failed independently.

### Query time: structured lookup first, RAG as fallback

`router.ts` classifies each question (cheap `gpt-4o-mini` call) into `deadline | grading | office_hours | open_ended` plus an optional entity. `retrieval.ts`:
- Tries a normalized-table `ILIKE` lookup for the three structured intents first, returning a templated answer with **no generation call** on a confident match.
- Falls back to RAG — embed the question, pgvector cosine search (`drizzle-orm`'s `cosineDistance`) over `syllabus_chunks`, top-5 above a similarity threshold, then a grounded generation call — for `open_ended` questions or structured misses.

The `/ask` response always includes `routing` and `sources` so retrieval mechanics are visible in the UI/API, not a black box.

### Schema (`backend/src/db/schema.ts`)

Point-queryable structured facts (`syllabus_deadlines`, `syllabus_grading_weights`) are separate tables from less queryable structured data (`syllabus_extracted` JSONB), separate again from the vector store (`syllabus_chunks`). This split is what lets the router hit a normalized column directly instead of the LLM/vector path for deterministic questions. `syllabus_chunks.embedding` uses an **HNSW** index rather than IVFFlat because HNSW needs no `lists` tuning or `ANALYZE` step at small/unknown row counts.

### Env loading

`backend/src/env.ts` and `backend/drizzle.config.ts` both load `.env` from the **repo root**, not `backend/`, via an explicit path — npm workspace scripts run with `cwd` set to the workspace directory. Keep a single root `.env`.
