import type { ChatMessage, Citation } from "../types";

interface Props {
  message: ChatMessage;
  /** Called when a [n] citation (inline or chip) is clicked. */
  onCitationClick?: (citation: Citation) => void;
}

/**
 * Render assistant text, turning inline citation markers like "[2]" into
 * clickable buttons that map to the message's citation list. Everything between
 * markers is rendered as plain (whitespace-preserving) text.
 */
function renderContent(
  content: string,
  citations: Citation[] | undefined,
  onCitationClick?: (citation: Citation) => void
) {
  if (!citations || citations.length === 0) return content;

  const parts = content.split(/(\[\d+\])/g); // keep the delimiters
  return parts.map((part, i) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (match) {
      const n = Number(match[1]);
      const citation = citations[n - 1];
      if (citation) {
        return (
          <button
            key={i}
            type="button"
            onClick={() => onCitationClick?.(citation)}
            className="mx-0.5 inline-flex items-center rounded bg-brand-100 px-1.5 text-xs font-semibold text-brand-700 align-baseline hover:bg-brand-500 hover:text-white focus-visible:ring-2"
            aria-label={`Source ${n}: ${citation.source}${
              citation.page != null ? `, page ${citation.page}` : ""
            }`}
          >
            {n}
          </button>
        );
      }
    }
    return <span key={i}>{part}</span>;
  });
}

export function MessageBubble({ message, onCitationClick }: Props) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={[
          "max-w-[85%] rounded-2xl px-4 py-2.5 leading-relaxed shadow-sm",
          isUser
            ? "bg-brand-600 text-white rounded-br-sm"
            : message.error
              ? "bg-red-50 text-red-800 border border-red-200 rounded-bl-sm"
              : "bg-white text-slate-800 border border-slate-200 rounded-bl-sm",
        ].join(" ")}
      >
        <div
          className="whitespace-pre-wrap break-words"
          // Assistant answers stream in — announce updates to screen readers.
          aria-live={message.role === "assistant" && message.streaming ? "polite" : undefined}
        >
          {renderContent(message.content, message.citations, onCitationClick)}
          {message.streaming && (
            <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-brand-500 align-middle" aria-hidden />
          )}
        </div>

        {/* Retrieval trace — which pipeline stages produced this answer. */}
        {!isUser && message.retrievalStages && message.retrievalStages.length > 0 && (
          <p className="mt-2 text-[11px] text-slate-400">
            🔎 retrieved via {message.retrievalStages.join(" → ")}
          </p>
        )}

        {/* Source chips under the answer, listing what was cited. */}
        {!isUser && message.citations && message.citations.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2">
            {message.citations.map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onCitationClick?.(c)}
                  className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 hover:bg-brand-100 hover:text-brand-700 focus-visible:ring-2"
                  title={c.snippet}
                >
                  <span className="font-semibold text-brand-600">[{i + 1}]</span>
                  <span className="max-w-[12rem] truncate">
                    {c.source}
                    {c.page != null ? ` · p.${c.page}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
