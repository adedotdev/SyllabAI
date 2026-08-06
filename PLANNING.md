# PLANNING.md

Roadmap and decision log for SyllabAI. `CLAUDE.md`/`AGENTS.md` describe how the current architecture works; this file tracks what's built, what's deferred, and why — update it when scope or a major decision changes, rather than letting that context live only in chat history.

## Status: Core MVP built and verified end-to-end

Real chunked-embedding RAG on pgvector, plus a structured-extraction pass so deterministic questions (deadlines, grading weights) skip the LLM. Verified against a real running stack (Docker Postgres+pgvector, real `OPENAI_API_KEY`): upload → parse → parallel chunk+embed/structured-extraction → `ready` status; a deadline question and a grading-weight question both routed `structured` with correct, instant answers; an open-ended late-policy question routed `rag`, retrieved the correct chunk by section title, and generated a grounded answer; an out-of-scope question (wifi password) was correctly refused rather than hallucinated. Also supports `.docx` uploads (via `mammoth`) alongside PDF, verified through the same pipeline.

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

"RAG system" language is now earned — real retrieval infrastructure exists and has been exercised end-to-end (see Status above). Accurate claims as of this verification: chunked-embedding RAG over pgvector with cosine similarity search, a structured-extraction pipeline that routes deterministic queries around the LLM, and (once added) an eval harness tracking hallucination rate — not just "used the OpenAI API in a prompt." The eval-harness and calendar-export bullets should stay framed as in-progress/planned until those are actually built (see Deferred, above).

## Next steps

1. ~~Get Docker running locally, fill in `OPENAI_API_KEY`, run the golden path~~ — done.
2. Pick the next deferred item: calendar export is the smallest lift, or start the eval harness if reliability is the priority for interview-readiness.
