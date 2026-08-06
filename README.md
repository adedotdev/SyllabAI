# SyllabAI

Upload a course syllabus (PDF or DOCX) and ask it questions: "when's the midterm," "what's the late policy," "how much is the final worth." The answers come from the actual document instead of a model guessing.

SyllabAI routes each question one of two ways: a normalized-data lookup for deterministic facts like deadlines and grading weights, or a retrieval-augmented generation (RAG) pipeline over chunked, embedded syllabus text for everything else. Every answer reports which path it took and what it was grounded in.

## Why it's built this way

The first version of this project, a hackathon build, answered questions by pasting the entire syllabus into a GPT prompt. That works for one short document, but it isn't retrieval. It doesn't scale, and it doesn't reduce hallucination risk in any principled way. This version replaces that with:

- **Real RAG** — the syllabus is chunked, embedded (`text-embedding-3-small`), and stored in Postgres via [pgvector](https://github.com/pgvector/pgvector), so answers are retrieved by similarity search over an actual vector index (HNSW), not stuffed into context.
- **Structured extraction** — a single GPT pass at upload time pulls deadlines, grading weights, office hours, and policies into normalized Postgres tables. Deterministic questions ("when's the midterm") are answered directly from that data, without an LLM call.


See [`PLANNING.md`](./PLANNING.md) for the full reasoning behind these choices (why pgvector over a managed vector DB, why HNSW over IVFFlat, etc.) and what's intentionally deferred. See [`CLAUDE.md`](./CLAUDE.md) / [`AGENTS.md`](./AGENTS.md) for a deeper architecture walkthrough aimed at working in the code.

## How a question gets answered

```
Upload PDF/DOCX
   │
   ▼
Parse text (unpdf / mammoth) ────┬─────────────────────────┐
   │                              │                          │
   ▼                              ▼                          
Chunk on headings, split      Structured extraction
by token count w/ overlap     (gpt-4o-mini, json_schema)
   │                              │
   ▼                              ▼
Embed chunks                  deadlines / grading weights /
(text-embedding-3-small)      office hours / policies
   │                              │
   ▼                              ▼
syllabus_chunks               syllabus_deadlines,
(pgvector, HNSW index)        syllabus_grading_weights,
                               syllabus_extracted (JSONB)

Ask a question
   │
   ▼
Classify intent (gpt-4o-mini): deadline / grading / office_hours / open_ended
   │
   ├── structured intent + confident table match ──▶ answer directly, no generation call
   │
   └── open_ended, or no match ──▶ embed question → pgvector cosine search (top 5)
                                    → grounded gpt-4o-mini generation
```

The two upload-time passes (chunking+embedding, and structured extraction) run in parallel — they only depend on the parsed text, not on each other.

## Tech stack

| Layer | Choice |
|---|---|
| Backend | Node.js, Express, TypeScript |
| Database | Postgres + [pgvector](https://github.com/pgvector/pgvector) (via Docker) |
| ORM | [Drizzle](https://orm.drizzle.team/) |
| Document parsing | [`unpdf`](https://github.com/unjs/unpdf) (PDF), [`mammoth`](https://github.com/mwilliamson/mammoth.js) (DOCX) |
| Embeddings / generation | OpenAI (`text-embedding-3-small`, `gpt-4o-mini`) |
| Frontend | React, Vite, React Router, TanStack Query |

## Getting started

Requires [Docker](https://www.docker.com/) and an [OpenAI API key](https://platform.openai.com/api-keys).

```bash
npm install
cp .env.example .env        # fill in OPENAI_API_KEY
docker compose up -d        # starts Postgres with pgvector on :5433 (not the default 5432 -- see docker-compose.yml)
npm run db:migrate          # creates the vector extension + tables

npm run dev:backend         # Express API on :4000
npm run dev:frontend        # Vite dev server on :5173 (proxies /api to :4000)
```

Open `http://localhost:5173`, upload a syllabus (PDF or DOCX), and once it finishes processing, ask it a question.

## API

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/syllabi` | Upload a syllabus PDF or DOCX (multipart, field `file`). Returns `202` immediately; processing happens async. |
| `GET` | `/api/syllabi` | List uploaded syllabi. |
| `GET` | `/api/syllabi/:id` | Get status (`uploaded`/`processing`/`ready`/`failed`) — poll this until ready. |
| `GET` | `/api/syllabi/:id/structured` | Get extracted deadlines, grading weights, office hours, and policies. |
| `POST` | `/api/syllabi/:id/ask` | Ask a question. Returns `{ answer, routing, sources }`. |

## Project structure

```
backend/src/
  db/schema.ts              # syllabi, deadlines, grading weights, extracted (JSONB), chunks (vector)
  services/
    documentParser.ts        # dispatches to pdfParser/docxParser by file extension
    chunker.ts               # heading-aware + token-based recursive chunking
    embeddings.ts             # batched OpenAI embeddings
    extraction.ts             # structured extraction (json_schema)
    ingestionPipeline.ts      # orchestrates the two parallel upload-time passes
    router.ts                 # classifies question intent
    retrieval.ts              # structured lookup + pgvector RAG fallback
  routes/                    # syllabi upload/list/get/structured, ask
frontend/src/
  pages/                     # UploadPage, SyllabusPage
  components/                # UploadForm, ChatPanel, StructuredSummary
```

## Status & roadmap

Core MVP (RAG + structured extraction) is built. Calendar export, multi-syllabus workspaces, and an evaluation harness for tracking hallucination rate are deferred — see [`PLANNING.md`](./PLANNING.md) for what's next and why.
