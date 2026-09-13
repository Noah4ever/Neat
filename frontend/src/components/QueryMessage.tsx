export function QueryMessage({
  query,
}: {
  query: { isPending: boolean; error: Error | null; refetch: () => unknown };
}) {
  return (
    <div className="empty-state" role="status">
      <p>
        {query.isPending
          ? "Loading…"
          : query.error?.message || "Nothing here yet."}
      </p>
      {query.error && (
        <button
          className="secondary-button"
          onClick={() => void query.refetch()}
          type="button"
        >
          Try again
        </button>
      )}
    </div>
  );
}
