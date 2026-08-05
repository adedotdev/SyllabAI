import { Router } from "express";
import { z } from "zod";
import { answerQuestion } from "../services/retrieval.js";

const router = Router();

const askBodySchema = z.object({
  question: z.string().min(1),
});

router.post("/:id/ask", async (req, res) => {
  const parsed = askBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "question is required" });
    return;
  }

  const result = await answerQuestion(req.params.id, parsed.data.question);
  res.json(result);
});

export default router;
