import { useEffect, useRef } from "react";
import { VariableSizeList, type ListChildComponentProps } from "react-window";
import type { ChatMessage, Citation } from "../types";
import { MessageBubble } from "./MessageBubble";
import { useElementSize } from "../hooks/useElementSize";

interface Props {
  messages: ChatMessage[];
  onCitationClick?: (citation: Citation) => void;
}

interface RowData {
  messages: ChatMessage[];
  setSize: (index: number, height: number) => void;
  onCitationClick?: (citation: Citation) => void;
}

const ESTIMATED_ROW_HEIGHT = 96;

/**
 * One virtualized row. Because chat bubbles have variable height (and grow as
 * tokens stream in), each row measures itself and reports its height back so the
 * list can position rows correctly.
 */
function Row({ index, style, data }: ListChildComponentProps<RowData>) {
  const { messages, setSize, onCitationClick } = data;
  const rowRef = useRef<HTMLDivElement>(null);

  // Measure after every render (content changes while streaming). Cheap for the
  // handful of rows react-window actually mounts.
  useEffect(() => {
    if (rowRef.current) {
      setSize(index, rowRef.current.getBoundingClientRect().height);
    }
  });

  // Rendered as <li> because the list container is an <ol> (see below) — valid,
  // accessible list semantics for the conversation transcript.
  return (
    <li style={style} className="list-none">
      <div ref={rowRef} className="px-4 py-2">
        <MessageBubble message={messages[index]} onCitationClick={onCitationClick} />
      </div>
    </li>
  );
}

/**
 * Virtualized chat transcript. react-window only renders the rows currently in
 * view, so a conversation with thousands of messages stays smooth. We keep a
 * cache of measured heights and auto-scroll to the newest message.
 */
export function MessageList({ messages, onCitationClick }: Props) {
  const { ref: containerRef, width, height } = useElementSize<HTMLDivElement>();
  const listRef = useRef<VariableSizeList>(null);
  const heights = useRef<Record<number, number>>({});

  const getSize = (index: number) => heights.current[index] ?? ESTIMATED_ROW_HEIGHT;

  const setSize = (index: number, measured: number) => {
    if (heights.current[index] !== measured) {
      heights.current[index] = measured;
      // Tell react-window the size changed from this row onward.
      listRef.current?.resetAfterIndex(index);
    }
  };

  // Auto-scroll to the latest message as it arrives / streams.
  useEffect(() => {
    listRef.current?.scrollToItem(messages.length - 1, "end");
  }, [messages]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      role="log"
      aria-label="Conversation"
      aria-relevant="additions"
    >
      {height > 0 && (
        <VariableSizeList
          ref={listRef}
          height={height}
          width={width}
          itemCount={messages.length}
          itemSize={getSize}
          estimatedItemSize={ESTIMATED_ROW_HEIGHT}
          itemData={{ messages, setSize, onCitationClick }}
          // The transcript is a log of messages — expose it as such to AT.
          innerElementType="ol"
        >
          {Row}
        </VariableSizeList>
      )}
    </div>
  );
}
