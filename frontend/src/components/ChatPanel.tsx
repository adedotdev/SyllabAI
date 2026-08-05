import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { askQuestion, type AskResult } from "../api/client";

interface Message {
  question: string;
  result: AskResult;
}

export default function ChatPanel({ syllabusId }: { syllabusId: string }) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);

  const mutation = useMutation({
    mutationFn: (q: string) => askQuestion(syllabusId, q),
    onSuccess: (result, q) => {
      setMessages((prev) => [...prev, { question: q, result }]);
      setQuestion("");
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    mutation.mutate(question);
  }

  return (
    <section>
      <h2>Ask a question</h2>
      <ul>
        {messages.map((m, i) => (
          <li key={i}>
            <p>
              <strong>Q:</strong> {m.question}
            </p>
            <p>
              <strong>A:</strong> {m.result.answer}
            </p>
            <p>
              <small>
                routing: {m.result.routing} · sources:{" "}
                {m.result.sources
                  .map((s) => (s.type === "chunk" ? s.sectionTitle ?? "excerpt" : s.type))
                  .join(", ") || "none"}
              </small>
            </p>
          </li>
        ))}
      </ul>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="When is the midterm?"
        />
        <button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Asking..." : "Ask"}
        </button>
      </form>
      {mutation.isError && <p role="alert">{(mutation.error as Error).message}</p>}
    </section>
  );
}
