import { useCallback, useRef, useState } from "react";
import type { ChatMessage, ChatStreamEvent } from "../types";
import { streamChat, streamSummary } from "../lib/api";

/** Small unique-id helper for message keys. */
function uid(): string {
  return crypto.randomUUID();
}

type StreamStarter = (
  onEvent: (event: ChatStreamEvent) => void,
  signal: AbortSignal
) => Promise<void>;

/**
 * Owns the chat conversation state and the streaming logic.
 *
 * (Angular analogy: think of this like a lightweight service that exposes an
 * observable `messages` list plus `ask()` / `summarize()` methods. Here,
 * `useState` gives us reactive state and returning it is how components subscribe.)
 */
export function useChatStream() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  /** Patch a single message by id (immutably — React re-renders on new arrays). */
  const patch = useCallback((id: string, changes: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...changes } : m)));
  }, []);

  /** Run an SSE stream into an existing assistant bubble, handling all event types. */
  const runAssistant = useCallback(
    async (assistantId: string, start: StreamStarter) => {
      setBusy(true);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        await start((event) => {
          switch (event.type) {
            case "token":
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: m.content + event.text } : m
                )
              );
              break;
            case "citations":
              patch(assistantId, { citations: event.items });
              break;
            case "trace":
              patch(assistantId, { retrievalStages: event.stages });
              break;
            case "error":
              patch(assistantId, { content: event.message, error: true, streaming: false });
              break;
            case "done":
              patch(assistantId, { streaming: false });
              break;
          }
        }, controller.signal);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong.";
        patch(assistantId, { content: message, error: true, streaming: false });
      } finally {
        patch(assistantId, { streaming: false });
        setBusy(false);
        abortRef.current = null;
      }
    },
    [patch]
  );

  /** Ask a question — optimistic user bubble + streamed assistant answer. */
  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return;

      const assistantId = uid();
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "user", content: q },
        { id: assistantId, role: "assistant", content: "", streaming: true },
      ]);
      await runAssistant(assistantId, (onEvent, signal) => streamChat(q, onEvent, signal));
    },
    [busy, runAssistant]
  );

  /** Stream a summary of a freshly-uploaded document as the first assistant message. */
  const summarize = useCallback(
    async (docId: string) => {
      const assistantId = uid();
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "", streaming: true },
      ]);
      await runAssistant(assistantId, (onEvent, signal) => streamSummary(docId, onEvent, signal));
    },
    [runAssistant]
  );

  /** Cancel an in-flight stream (used when the component unmounts, etc.). */
  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { messages, busy, ask, summarize, stop };
}
