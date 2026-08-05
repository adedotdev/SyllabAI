export interface SyllabusSummary {
  id: string;
  filename: string;
  status: "uploaded" | "processing" | "ready" | "failed";
  createdAt: string;
}

export interface SyllabusDetail extends SyllabusSummary {
  chunkingError: string | null;
  extractionError: string | null;
}

export interface StructuredData {
  deadlines: Array<{
    id: string;
    title: string;
    category: string;
    dueDate: string | null;
    dueDateText: string;
    sourceExcerpt: string | null;
  }>;
  gradingWeights: Array<{ id: string; componentName: string; weightPercent: string | null }>;
  officeHours: Array<{ day: string; startTime: string | null; endTime: string | null; location: string | null; instructor: string | null }>;
  policies: Array<{ topic: string; text: string }>;
}

export type Source =
  | { type: "deadline"; title: string; dueDate: string | null }
  | { type: "grading"; componentName: string; weightPercent: string | null }
  | { type: "chunk"; sectionTitle: string | null; excerpt: string };

export interface AskResult {
  answer: string;
  routing: "structured" | "rag";
  sources: Source[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export function uploadSyllabus(file: File): Promise<{ id: string; status: string }> {
  const formData = new FormData();
  formData.append("file", file);
  return request("/syllabi", { method: "POST", body: formData });
}

export function getSyllabus(id: string): Promise<SyllabusDetail> {
  return request(`/syllabi/${id}`);
}

export function listSyllabi(): Promise<SyllabusSummary[]> {
  return request("/syllabi");
}

export function getStructuredData(id: string): Promise<StructuredData> {
  return request(`/syllabi/${id}/structured`);
}

export function askQuestion(id: string, question: string): Promise<AskResult> {
  return request(`/syllabi/${id}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
}
