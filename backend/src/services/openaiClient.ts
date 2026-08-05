import OpenAI from "openai";
import { env } from "../env.js";

export const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const GENERATION_MODEL = "gpt-4o-mini";
