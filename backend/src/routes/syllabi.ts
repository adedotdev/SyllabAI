import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { v4 as uuidv4 } from "uuid";
import { asc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  syllabi,
  syllabusDeadlines,
  syllabusGradingWeights,
  syllabusExtracted,
} from "../db/schema.js";
import { env } from "../env.js";
import { runIngestionPipeline } from "../services/ingestionPipeline.js";

const router = Router();

fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: env.UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      cb(new Error("Only PDF files are supported"));
      return;
    }
    cb(null, true);
  },
});

router.post("/", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const [created] = await db
    .insert(syllabi)
    .values({
      filename: req.file.originalname,
      filePath: req.file.path,
      status: "uploaded",
    })
    .returning({ id: syllabi.id, status: syllabi.status });

  // Fire-and-forget: the client polls GET /:id for progress rather than
  // blocking the upload response on parsing/embedding/extraction.
  runIngestionPipeline(created.id).catch((err) => {
    console.error(`Ingestion pipeline failed for syllabus ${created.id}:`, err);
  });

  res.status(202).json(created);
});

router.get("/", async (_req, res) => {
  const rows = await db
    .select({
      id: syllabi.id,
      filename: syllabi.filename,
      status: syllabi.status,
      createdAt: syllabi.createdAt,
    })
    .from(syllabi)
    .orderBy(asc(syllabi.createdAt));
  res.json(rows);
});

router.get("/:id", async (req, res) => {
  const [row] = await db
    .select({
      id: syllabi.id,
      filename: syllabi.filename,
      status: syllabi.status,
      createdAt: syllabi.createdAt,
      chunkingError: syllabi.chunkingError,
      extractionError: syllabi.extractionError,
    })
    .from(syllabi)
    .where(eq(syllabi.id, req.params.id));

  if (!row) {
    res.status(404).json({ error: "Syllabus not found" });
    return;
  }
  res.json(row);
});

router.get("/:id/structured", async (req, res) => {
  const syllabusId = req.params.id;

  const [deadlines, gradingWeights, extracted] = await Promise.all([
    db.select().from(syllabusDeadlines).where(eq(syllabusDeadlines.syllabusId, syllabusId)),
    db.select().from(syllabusGradingWeights).where(eq(syllabusGradingWeights.syllabusId, syllabusId)),
    db.select().from(syllabusExtracted).where(eq(syllabusExtracted.syllabusId, syllabusId)),
  ]);

  res.json({
    deadlines,
    gradingWeights,
    officeHours: extracted[0]?.officeHours ?? [],
    policies: extracted[0]?.policies ?? [],
  });
});

export default router;
