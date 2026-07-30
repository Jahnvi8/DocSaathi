import { useCallback, useEffect, useRef, useState } from "react";

interface Options {
  /** BCP-47 language tag. Defaults to Hindi (India). */
  lang?: string;
  /** Called with the (possibly interim) transcript as the user speaks. */
  onResult: (transcript: string, isFinal: boolean) => void;
  onError?: (message: string) => void;
}

/**
 * Wraps the browser's Web Speech API for speech-to-text. Defaults to `hi-IN`
 * so users can dictate questions in Hindi. Gracefully reports `supported: false`
 * in browsers without the API (e.g. Firefox), so the UI can hide the mic button.
 */
export function useVoiceInput({ lang = "hi-IN", onResult, onError }: Options) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Keep the latest callbacks in refs so we can create the recognition object
  // once (not on every render) without capturing stale closures.
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  onResultRef.current = onResult;
  onErrorRef.current = onError;

  useEffect(() => {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      setSupported(false);
      return;
    }
    setSupported(true);

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.interimResults = true; // update text live as the user speaks
    recognition.continuous = false; // stop automatically after a pause

    recognition.onresult = (event) => {
      let transcript = "";
      let isFinal = false;
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
        if (event.results[i].isFinal) isFinal = true;
      }
      onResultRef.current(transcript, isFinal);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = (event) => {
      onErrorRef.current?.(event.error || "Speech recognition error");
      setListening(false);
    };

    recognitionRef.current = recognition;
    return () => {
      try {
        recognition.stop();
      } catch {
        /* ignore — may not be running */
      }
    };
  }, [lang]);

  const start = useCallback(() => {
    try {
      recognitionRef.current?.start();
      setListening(true);
    } catch {
      // .start() throws if already started — ignore.
    }
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  return { supported, listening, start, stop };
}
