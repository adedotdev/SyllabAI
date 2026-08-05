import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getSyllabus } from "../api/client";
import ChatPanel from "../components/ChatPanel";
import StructuredSummary from "../components/StructuredSummary";

export default function SyllabusPage() {
  const { id } = useParams<{ id: string }>();

  const { data: syllabus } = useQuery({
    queryKey: ["syllabus", id],
    queryFn: () => getSyllabus(id!),
    enabled: !!id,
    refetchInterval: (query) =>
      query.state.data?.status === "ready" || query.state.data?.status === "failed" ? false : 1500,
  });

  if (!id) return null;
  if (!syllabus) return <p>Loading...</p>;

  if (syllabus.status === "uploaded" || syllabus.status === "processing") {
    return <p>Processing "{syllabus.filename}"... (parsing, chunking, and extracting structured data)</p>;
  }

  if (syllabus.status === "failed") {
    return (
      <div>
        <p role="alert">Processing failed for "{syllabus.filename}".</p>
        {syllabus.chunkingError && <p>Chunking error: {syllabus.chunkingError}</p>}
        {syllabus.extractionError && <p>Extraction error: {syllabus.extractionError}</p>}
      </div>
    );
  }

  return (
    <main style={{ display: "flex", gap: "2rem" }}>
      <div style={{ flex: 2 }}>
        <h1>{syllabus.filename}</h1>
        <ChatPanel syllabusId={id} />
      </div>
      <StructuredSummary syllabusId={id} />
    </main>
  );
}
