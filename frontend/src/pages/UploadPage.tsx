import UploadForm from "../components/UploadForm";

export default function UploadPage() {
  return (
    <main>
      <h1>SyllabAI</h1>
      <p>Upload a course syllabus (PDF or DOCX) to ask questions about deadlines, grading, and policies.</p>
      <UploadForm />
    </main>
  );
}
