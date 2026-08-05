import { encode, decode } from "gpt-tokenizer";

export interface Chunk {
  chunkIndex: number;
  sectionTitle: string | null;
  content: string;
  tokenCount: number;
}

const TARGET_TOKENS = 300;
const OVERLAP_TOKENS = 50;

// Common syllabus section headings. Matched at the start of a line, case
// insensitive, optionally followed by punctuation (":", numbering, etc).
const HEADING_PATTERN =
  /^\s*(?:[0-9]+[.)]\s*)?(grading|schedule|policies|policy|office hours|assignments|academic integrity|attendance|late (?:work|policy)|course description|objectives|materials|contact)\b.*$/im;

interface Section {
  title: string | null;
  text: string;
}

function splitIntoSections(rawText: string): Section[] {
  const lines = rawText.split(/\r?\n/);
  const sections: Section[] = [];
  let currentTitle: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    if (HEADING_PATTERN.test(line)) {
      if (currentLines.length > 0) {
        sections.push({ title: currentTitle, text: currentLines.join("\n").trim() });
      }
      currentTitle = line.trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  if (currentLines.length > 0) {
    sections.push({ title: currentTitle, text: currentLines.join("\n").trim() });
  }

  return sections.filter((s) => s.text.length > 0);
}

// Recursively token-splits a section's text into ~TARGET_TOKENS chunks with
// OVERLAP_TOKENS of overlap between consecutive chunks, so a fact split
// across a chunk boundary still appears whole in at least one chunk.
function splitByTokens(text: string): string[] {
  const tokens = encode(text);
  if (tokens.length <= TARGET_TOKENS) return [text];

  const parts: string[] = [];
  let start = 0;
  while (start < tokens.length) {
    const end = Math.min(start + TARGET_TOKENS, tokens.length);
    parts.push(decode(tokens.slice(start, end)));
    if (end === tokens.length) break;
    start = end - OVERLAP_TOKENS;
  }
  return parts;
}

export function chunkSyllabus(rawText: string): Chunk[] {
  const sections = splitIntoSections(rawText);
  const chunks: Chunk[] = [];
  let chunkIndex = 0;

  for (const section of sections) {
    const pieces = splitByTokens(section.text);
    for (const piece of pieces) {
      chunks.push({
        chunkIndex: chunkIndex++,
        sectionTitle: section.title,
        content: piece,
        tokenCount: encode(piece).length,
      });
    }
  }

  return chunks;
}
