import { useEffect, useRef, useState } from "react";
import type { Citation, PublicChunk } from "../types";
import { getDocumentChunks } from "../lib/api";

interface Props {
  /** The citation the user most recently clicked (null = nothing selected). */
  citation: Citation | null;
}

/**
 * Source panel. When a citation is clicked, we load that document's chunks,
 * render them in order, then scroll to and highlight the exact cited chunk.
 * This is what makes citations "clickable" end-to-end: answer → source passage.
 */
export function DocumentViewer({ citation }: Props) {
  const [chunks, setChunks] = useState<PublicChunk[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const loadedDocId = useRef<string | null>(null);
  const activeRef = useRef<HTMLLIElement>(null);

  // Load the document's chunks when the selected citation points to a new doc.
  useEffect(() => {
    if (!citation) return;
    if (loadedDocId.current === citation.docId) return; // already loaded
    setLoading(true);
    setError(null);
    getDocumentChunks(citation.docId)
      .then((cs) => {
        setChunks(cs);
        loadedDocId.current = citation.docId;
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load document."))
      .finally(() => setLoading(false));
  }, [citation]);

  // Scroll the highlighted passage into view whenever the selection changes.
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [citation, chunks]);

  return (
    <aside
      className="hidden min-h-0 flex-col overflow-hidden bg-white md:flex"
      aria-label="Source document viewer"
    >
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Source</h2>
        {citation && (
          <p className="mt-0.5 truncate text-sm text-slate-700">
            📄 {citation.source}
            {citation.page != null ? ` · page ${citation.page}` : ""}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
        {!citation && (
          <p className="text-sm text-slate-400">
            Click a citation like <span className="font-semibold text-brand-600">[1]</span> in an
            answer to jump to the exact source passage here.
          </p>
        )}

        {loading && <p className="text-sm text-slate-400">Loading document…</p>}
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        {citation && !loading && !error && (
          <ol className="space-y-3">
            {chunks.map((chunk) => {
              const isActive = chunk.id === citation.id;
              return (
                <li
                  key={chunk.id}
                  ref={isActive ? activeRef : undefined}
                  aria-current={isActive ? "location" : undefined}
                  className={[
                    "rounded-lg p-3 text-sm leading-relaxed transition",
                    isActive
                      ? "bg-amber-100 ring-2 ring-amber-400 text-slate-900"
                      : "bg-slate-50 text-slate-600",
                  ].join(" ")}
                >
                  {chunk.page != null && (
                    <span className="mb-1 block text-xs font-medium text-slate-400">
                      page {chunk.page}
                    </span>
                  )}
                  <p className="whitespace-pre-wrap break-words">{chunk.text}</p>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </aside>
  );
}
