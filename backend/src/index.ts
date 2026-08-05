import express from "express";
import cors from "cors";
import { env } from "./env.js";
import syllabiRouter from "./routes/syllabi.js";
import askRouter from "./routes/ask.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/syllabi", syllabiRouter);
app.use("/api/syllabi", askRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
});

app.listen(env.PORT, () => {
  console.log(`SyllabAI backend listening on http://localhost:${env.PORT}`);
});
