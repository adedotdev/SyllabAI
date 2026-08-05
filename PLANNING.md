# PLANNING.md

Roadmap and decision log for SyllabAI. `CLAUDE.md`/`AGENTS.md` describe how the current architecture works; this file tracks what's built, what's deferred, and why — update it when scope or a major decision changes, rather than letting that context live only in chat history.

## Status: Core MVP built, not yet run end-to-end

Real chunked-embedding RAG on pgvector, plus a structured-extraction pass so deterministic questions (deadlines, grading weights) skip the LLM. Backend and frontend typecheck and build; the chunker has been smoke-tested standalone. Not yet verified: the actual golden path (upload → ingest → ask), which needs Docker running Postgres+pgvector and a real `OPENAI_API_KEY`.

## Why this rebuild happened

The original was a ColorStack Winter Hackathon project (Node.js + OpenAI API) that answered syllabus questions by stuffing the entire parsed PDF into a GPT prompt. That's not real retrieval — it doesn't scale past one short document, and it doesn't support an honest "built a RAG system" resume claim. This rebuild trades that context-stuffing approach for actual chunking + embeddings + vector search, plus a structured-extraction layer so deterministic lookups don't need an LLM call at all.

## Key decisions

- **pgvector over Pinecone/a managed vector DB** — one Postgres database handles both vector search and structured extraction, and it demonstrates understanding of retrieval mechanics rather than calling a managed API. Postgres was already a confirmed skill, so this is also the stronger resume story.
- **HNSW over IVFFlat** for the chunk embedding index — IVFFlat needs a `lists` parameter tuned to row count plus an `ANALYZE` step, awkward at unknown/small scale; HNSW builds incrementally with no training step. At MVP row counts this is about demonstrating the right default, not solving a real performance problem yet.
- **Structured tables + JSONB catch-all, not one big JSON blob** — `syllabus_deadlines`/`syllabus_grading_weights` are normalized specifically so the query router can `ILIKE`-match and answer without an LLM call; `syllabus_extracted` (JSONB) holds office hours/policies, which don't have an obvious single queryable column.
- **In-process async ingestion, no job queue** — MVP volume doesn't justify BullMQ/Redis; the pipeline is an isolated service function (`ingestionPipeline.ts`) so a queue can be swapped in later without a redesign.
- **Drizzle ORM over Prisma** — first-class `vector` column type and typed `cosineDistance`/similarity helpers keep vector search in typed query-builder code instead of Prisma's raw-`$queryRaw`-only pgvector support.
- **TypeScript across backend and frontend** — type safety across DB rows, OpenAI structured-output schemas, and API contracts, at the cost of more setup than the original JS hackathon stack.

## Deferred (explicitly out of scope for the MVP)

These were scoped out so the MVP could ship without design-by-committee, but the schema/pipeline were shaped so none of them require a rewrite:

- **Calendar export** (`.ics` / Google Calendar API) — hangs directly off `syllabus_deadlines`; no schema change needed.
- **Multi-syllabus workspace** (tracking which class a question is about across a semester) — add a `workspace_id` FK; doesn't touch the vector/structured split.
- **Eval harness** (~20-30 hand-written Q&A pairs per syllabus, exact-match for structured fields + LLM-as-judge for open-ended, results logged to CSV) — consumes `/ask` and `/structured` as they're already built, and reuses `extraction.schema.ts` as ground truth.

## Resume framing

Don't upgrade the resume bullet to "RAG system" language until real retrieval infrastructure exists and has been exercised end-to-end (it hasn't yet — see Status above). Once verified, the accurate claims are: chunked-embedding RAG over pgvector with cosine similarity search, a structured-extraction pipeline that routes deterministic queries around the LLM, and (once added) an eval harness tracking hallucination rate — not just "used the OpenAI API in a prompt."

## Next steps

1. Get Docker running locally, fill in `OPENAI_API_KEY`, run the golden path (upload a real syllabus PDF → structured summary populates → deadline question routes `structured` → open-ended question routes `rag` with grounded sources → out-of-syllabus question is refused rather than hallucinated).
2. Once the MVP is verified, pick the next deferred item (calendar export is the smallest lift) or start the eval harness if reliability is the priority for interview-readiness.
