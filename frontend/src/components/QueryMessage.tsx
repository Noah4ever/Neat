import { messageForError } from "../services/errors";

export function QueryMessage({
  query,
}: {
  query: { isPending: boolean; error: Error | null; refetch: () => unknown };
}) {
  const errorMessage = query.error ? messageForError(query.error) : null;
  return (
    <div className="empty-state" role="status">
      <p>
        {query.isPending
          ? "Loading…"
          : errorMessage
            ? `${errorMessage.title}. ${errorMessage.message}`
            : "Nothing here yet."}
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
