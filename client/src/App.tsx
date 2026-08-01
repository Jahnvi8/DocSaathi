import { useEffect, useState } from "react";
import type { Citation, IndexedDoc } from "./types";
import { listDocuments, deleteDocument, type UploadResult } from "./lib/api";
import { useChatStream } from "./hooks/useChatStream";
import { useToast } from "./components/Toaster";
import { UploadDropzone } from "./components/UploadDropzone";
import { ChatPanel } from "./components/ChatPanel";
import { DocumentViewer } from "./components/DocumentViewer";

export default function App() {
  const { messages, busy, ask, summarize } = useChatStream();
  const toast = useToast();
  const [docs, setDocs] = useState<IndexedDoc[]>([]);
  const [hasApiKey, setHasApiKey] = useState(true); // assume ok until told otherwise
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  // Which document the chat is scoped to (null = search across all documents).
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  // On mount: check server health (is a key configured?) and load indexed docs.
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setHasApiKey(Boolean(d.hasApiKey)))
      .catch(() => setHasApiKey(true));
    listDocuments().then(setDocs).catch(() => setDocs([]));
  }, []);

  const onUploaded = (result: UploadResult) => {
    listDocuments().then(setDocs).catch(() => {});
    // Focus the freshly-uploaded document so the user can summarize or ask about
    // it right away. Summarizing is now on-demand (a button) rather than
    // automatic, to conserve the limited free-tier generation quota.
    setSelectedDocId(result.docId);
  };

  const handleDelete = async (doc: IndexedDoc) => {
    if (!window.confirm(`Delete “${doc.source}”? This removes it from the index.`)) return;
    try {
      await deleteDocument(doc.docId);
      if (selectedDocId === doc.docId) setSelectedDocId(null);
      setActiveCitation((c) => (c?.docId === doc.docId ? null : c));
      const next = await listDocuments();
      setDocs(next);
      toast.success(`Deleted “${doc.source}”.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the document.");
    }
  };

  const hasDocs = docs.length > 0;
  const selectedDoc = docs.find((d) => d.docId === selectedDocId) ?? null;

  return (
    <div className="flex h-screen flex-col">
      {/* Keyboard users can jump straight to the input, skipping the header/upload. */}
      <a
        href="#composer"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-accent-deep focus:px-3 focus:py-2 focus:text-white"
      >
        Skip to chat input
      </a>

      {/* Header */}
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">📄🤝</span>
          <h1 className="text-lg font-bold text-accent">DocSaathi</h1>
          <span className="hidden text-sm text-faint sm:inline">
            — chat with your documents
          </span>
        </div>
      </header>

      {/* Missing-key banner */}
      {!hasApiKey && (
        <div role="alert" className="bg-saffron-soft px-4 py-2 text-sm text-saffron">
          ⚠️ No Gemini API key configured. Add <code className="font-mono">GEMINI_API_KEY</code> to
          your <code className="font-mono">.env</code> (get one free at{" "}
          <a
            className="underline"
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noreferrer"
          >
            Google AI Studio
          </a>
          ), then restart the server.
        </div>
      )}

      {/* Main two-column layout */}
      <main className="grid min-h-0 flex-1 md:grid-cols-2">
        {/* Left: upload + chat */}
        <div className="flex min-h-0 flex-col md:border-r md:border-line">
          <div className="border-b border-line bg-surface p-3">
            <UploadDropzone onUploaded={onUploaded} />
            {hasDocs && (
              <>
                <ul className="mt-2 space-y-1" aria-label="Indexed documents">
                  {docs.map((d) => {
                    const active = d.docId === selectedDocId;
                    return (
                      <li key={d.docId} className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setSelectedDocId(active ? null : d.docId)}
                          aria-pressed={active}
                          title={active ? "Click to search all documents" : "Click to ask only this document"}
                          className={`flex-1 truncate rounded-md px-2 py-1 text-left text-xs transition ${
                            active
                              ? "bg-accent-deep text-white"
                              : "bg-accent-soft text-accent hover:bg-accent-softer"
                          }`}
                        >
                          📄 {d.source} · {d.chunkCount} chunks
                        </button>
                        <button
                          type="button"
                          onClick={() => summarize(d.docId)}
                          disabled={busy}
                          aria-label={`Summarize ${d.source}`}
                          title="Summarize this document"
                          className="rounded-md px-1.5 py-1 text-faint transition hover:bg-accent-soft hover:text-accent-deep disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          ✨
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(d)}
                          aria-label={`Delete ${d.source}`}
                          title="Delete document"
                          className="rounded-md p-1 text-faint transition hover:bg-danger-soft hover:text-danger"
                        >
                          🗑️
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-1.5 text-[11px] text-faint">
                  {selectedDoc
                    ? `Answering from “${selectedDoc.source}” only — click it again to search all.`
                    : "Answering from all documents — click one to focus it."}{" "}
                  Use ✨ to summarize a document.
                </p>
              </>
            )}
          </div>
          <div className="min-h-0 flex-1">
            <ChatPanel
              messages={messages}
              busy={busy}
              hasDocs={hasDocs}
              onSend={(text) => ask(text, selectedDocId ?? undefined)}
              onCitationClick={setActiveCitation}
            />
          </div>
        </div>

        {/* Right: source viewer — scrolls to & highlights the cited passage. */}
        <DocumentViewer citation={activeCitation} />
      </main>
    </div>
  );
}
