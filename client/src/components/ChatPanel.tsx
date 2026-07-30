import type { ChatMessage, Citation } from "../types";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";

interface Props {
  messages: ChatMessage[];
  busy: boolean;
  hasDocs: boolean;
  onSend: (text: string) => void;
  onCitationClick?: (citation: Citation) => void;
}

function EmptyState({ hasDocs }: { hasDocs: boolean }) {
  return (
    <div className="grid h-full place-items-center p-8 text-center">
      <div className="max-w-sm text-slate-500">
        <div className="text-4xl">💬</div>
        <p className="mt-3 font-medium text-slate-700">
          {hasDocs ? "Ask your first question" : "Upload a document to get started"}
        </p>
        <p className="mt-1 text-sm">
          {hasDocs
            ? "Ask anything about your document — in English, हिंदी, or Hinglish."
            : "Once a PDF or text file is indexed, you can chat with it here."}
        </p>
      </div>
    </div>
  );
}

export function ChatPanel({ messages, busy, hasDocs, onSend, onCitationClick }: Props) {
  return (
    <section className="flex h-full flex-col bg-slate-50" aria-label="Chat">
      <div className="min-h-0 flex-1">
        {messages.length === 0 ? (
          <EmptyState hasDocs={hasDocs} />
        ) : (
          <MessageList messages={messages} onCitationClick={onCitationClick} />
        )}
      </div>
      <div className="border-t border-slate-200 bg-white p-3">
        <Composer onSend={onSend} disabled={busy || !hasDocs} />
        <p className="mt-1.5 text-center text-xs text-slate-400">
          DocSaathi answers only from your uploaded documents, with citations.
        </p>
      </div>
    </section>
  );
}
