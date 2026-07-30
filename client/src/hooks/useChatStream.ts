import { useCallback, useRef, useState } from "react";
import type { ChatMessage } from "../types";
import { streamChat } from "../lib/api";

/** Small unique-id helper for message keys. */
function uid(): string {
  return crypto.randomUUID();
}

/**
 * Owns the chat conversation state and the streaming logic.
 *
 * (Angular analogy: think of this like a lightweight service that exposes an
 * observable `messages` list plus an `ask()` method. Here, `useState` gives us
 * reactive state and returning it from the hook is how components subscribe.)
 */
export function useChatStream() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  /** Patch a single message by id (immutably — React re-renders on new arrays). */
  const patch = useCallback((id: string, changes: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...changes } : m)));
  }, []);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return;

      // Optimistic update: show the user's message and an empty assistant
      // bubble immediately, before any network response arrives.
      const assistantId = uid();
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "user", content: q },
        { id: assistantId, role: "assistant", content: "", streaming: true },
      ]);
      setBusy(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await streamChat(
          q,
          (event) => {
            switch (event.type) {
              case "token":
                // Append each streamed token to the assistant bubble.
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
                patch(assistantId, {
                  content: event.message,
                  error: true,
                  streaming: false,
                });
                break;
              case "done":
                patch(assistantId, { streaming: false });
                break;
            }
          },
          controller.signal
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong.";
        patch(assistantId, { content: message, error: true, streaming: false });
      } finally {
        patch(assistantId, { streaming: false });
        setBusy(false);
        abortRef.current = null;
      }
    },
    [busy, patch]
  );

  /** Cancel an in-flight answer (used when the component unmounts, etc.). */
  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { messages, busy, ask, stop };
}
