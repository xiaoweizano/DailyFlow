import type { SearchHit } from "@dailyflow/application";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function getTitleHaystack(result: SearchHit): string {
  return `${result.title} ${result.snippet}`;
}

function hasSearchHighlight(result: SearchHit, query: string): boolean {
  const normalizedQuery = query.trim();
  return (
    normalizedQuery !== "" &&
    getTitleHaystack(result).toLocaleLowerCase().includes(normalizedQuery.toLocaleLowerCase())
  );
}

export function SearchHighlight({
  result,
  query,
}: {
  readonly result: SearchHit;
  readonly query: string;
}): React.JSX.Element {
  const normalizedQuery = query.trim();
  if (normalizedQuery === "" || !hasSearchHighlight(result, normalizedQuery)) {
    return <>{result.snippet}</>;
  }

  const matcher = new RegExp(`(${escapeRegExp(normalizedQuery)})`, "giu");
  const parts = result.snippet.split(matcher);
  return (
    <>
      {parts.map((part, index) =>
        part.toLocaleLowerCase() === normalizedQuery.toLocaleLowerCase() ? (
          <mark key={`${part}-${index}`} className="rounded-[2px] bg-warning/25 px-0.5">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}
