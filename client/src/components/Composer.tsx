import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useVoiceInput } from "../hooks/useVoiceInput";

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
}

/**
 * The message input. Enter sends; Shift+Enter inserts a newline. Includes a mic
 * button for Hindi (hi-IN) voice dictation via the Web Speech API — the button
 * is hidden automatically in browsers that don't support speech recognition.
 */
export function Composer({ onSend, disabled }: Props) {
  const [text, setText] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  // Text present when dictation started, so we append speech instead of replacing.
  const baseRef = useRef("");

  const { supported, listening, start, stop } = useVoiceInput({
    lang: "hi-IN",
    onResult: (transcript) => {
      setText(`${baseRef.current} ${transcript}`.trim());
    },
    onError: (message) =>
      setVoiceError(
        message === "not-allowed"
          ? "Microphone permission denied."
          : message === "no-speech"
            ? "Didn't catch that — try again."
            : "Voice input error."
      ),
  });

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const toggleMic = () => {
    setVoiceError(null);
    if (listening) {
      stop();
    } else {
      baseRef.current = text;
      start();
    }
  };

  return (
    <div>
      <form onSubmit={submit} className="flex items-end gap-2">
        <label htmlFor="composer" className="sr-only">
          Ask a question about your document
        </label>
        <textarea
          id="composer"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Ask in English, हिंदी, or Hinglish…"
          className="min-h-[44px] max-h-40 flex-1 resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none"
        />

        {supported && (
          <button
            type="button"
            onClick={toggleMic}
            aria-pressed={listening}
            aria-label={listening ? "Stop voice input" : "Start Hindi voice input"}
            title={listening ? "Stop listening" : "Speak in Hindi (hi-IN)"}
            className={[
              "grid h-11 w-11 shrink-0 place-items-center rounded-xl border transition",
              listening
                ? "animate-pulse border-red-300 bg-red-100 text-red-600"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
            ].join(" ")}
          >
            🎙️
          </button>
        )}

        <button
          type="submit"
          disabled={disabled || !text.trim()}
          className="h-11 shrink-0 rounded-xl bg-brand-600 px-4 font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send
        </button>
      </form>

      {listening && (
        <p className="mt-1 text-xs text-red-500" aria-live="polite">
          🔴 Listening… speak in Hindi.
        </p>
      )}
      {voiceError && (
        <p role="alert" className="mt-1 text-xs text-red-500">
          {voiceError}
        </p>
      )}
    </div>
  );
}
