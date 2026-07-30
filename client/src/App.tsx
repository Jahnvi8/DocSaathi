import { useEffect, useState } from "react";
import type { Citation, IndexedDoc } from "./types";
import { listDocuments, type UploadResult } from "./lib/api";
import { useChatStream } from "./hooks/useChatStream";
import { UploadDropzone } from "./components/UploadDropzone";
import { ChatPanel } from "./components/ChatPanel";
import { DocumentViewer } from "./components/DocumentViewer";

export default function App() {
  const { messages, busy, ask } = useChatStream();
  const [docs, setDocs] = useState<IndexedDoc[]>([]);
  const [hasApiKey, setHasApiKey] = useState(true); // assume ok until told otherwise
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);

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
    // If this is the first doc, keep things tidy; no message needed.
    void result;
  };

  const hasDocs = docs.length > 0;

  return (
    <div className="flex h-screen flex-col">
      {/* Keyboard users can jump straight to the input, skipping the header/upload. */}
      <a
        href="#composer"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-brand-600 focus:px-3 focus:py-2 focus:text-white"
      >
        Skip to chat input
      </a>

      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">📄🤝</span>
          <h1 className="text-lg font-bold text-brand-700">DocSaathi</h1>
          <span className="hidden text-sm text-slate-400 sm:inline">
            — chat with your documents
          </span>
        </div>
      </header>

      {/* Missing-key banner */}
      {!hasApiKey && (
        <div role="alert" className="bg-amber-50 px-4 py-2 text-sm text-amber-800">
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
        <div className="flex min-h-0 flex-col md:border-r md:border-slate-200">
          <div className="border-b border-slate-200 bg-white p-3">
            <UploadDropzone onUploaded={onUploaded} />
            {hasDocs && (
              <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Indexed documents">
                {docs.map((d) => (
                  <li
                    key={d.docId}
                    className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs text-brand-700"
                  >
                    📄 {d.source} · {d.chunkCount} chunks
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="min-h-0 flex-1">
            <ChatPanel
              messages={messages}
              busy={busy}
              hasDocs={hasDocs}
              onSend={ask}
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
