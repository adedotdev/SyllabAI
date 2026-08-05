import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { uploadSyllabus } from "../api/client";

export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setSubmitting(true);
    setError(null);
    try {
      const { id } = await uploadSyllabus(file);
      navigate(`/syllabi/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="file"
        accept="application/pdf"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <button type="submit" disabled={!file || submitting}>
        {submitting ? "Uploading..." : "Upload syllabus"}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
