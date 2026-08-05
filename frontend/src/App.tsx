import { Routes, Route } from "react-router-dom";
import UploadPage from "./pages/UploadPage";
import SyllabusPage from "./pages/SyllabusPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<UploadPage />} />
      <Route path="/syllabi/:id" element={<SyllabusPage />} />
    </Routes>
  );
}
