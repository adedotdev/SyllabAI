import { useQuery } from "@tanstack/react-query";
import { getStructuredData } from "../api/client";

export default function StructuredSummary({ syllabusId }: { syllabusId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["structured", syllabusId],
    queryFn: () => getStructuredData(syllabusId),
  });

  if (isLoading) return <p>Loading structured data...</p>;
  if (error) return <p role="alert">{(error as Error).message}</p>;
  if (!data) return null;

  return (
    <aside>
      <h2>Deadlines</h2>
      <ul>
        {data.deadlines.map((d) => (
          <li key={d.id}>
            {d.title} — {d.dueDate ?? d.dueDateText} ({d.category})
          </li>
        ))}
        {data.deadlines.length === 0 && <li>No deadlines extracted.</li>}
      </ul>

      <h2>Grading</h2>
      <ul>
        {data.gradingWeights.map((g) => (
          <li key={g.id}>
            {g.componentName}: {g.weightPercent}%
          </li>
        ))}
        {data.gradingWeights.length === 0 && <li>No grading breakdown extracted.</li>}
      </ul>

      <h2>Office hours</h2>
      <ul>
        {data.officeHours.map((o, i) => (
          <li key={i}>
            {o.day} {o.startTime ?? ""}–{o.endTime ?? ""} {o.location ? `(${o.location})` : ""}
          </li>
        ))}
        {data.officeHours.length === 0 && <li>No office hours extracted.</li>}
      </ul>
    </aside>
  );
}
