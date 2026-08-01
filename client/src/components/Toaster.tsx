import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  notify: (kind: ToastKind, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Access the toast API. Must be used inside <ToastProvider>. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

const STYLES: Record<ToastKind, string> = {
  success: "border-ok-border bg-ok-soft text-ok-text",
  error: "border-danger-border bg-danger-soft text-danger-text",
  info: "border-accent bg-accent-soft text-saffron",
};
const ICONS: Record<ToastKind, string> = { success: "✅", error: "⚠️", info: "ℹ️" };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (kind: ToastKind, message: string) => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current, { id, kind, message }]);
      // Auto-dismiss; errors linger a little longer so they can be read.
      setTimeout(() => remove(id), kind === "error" ? 6000 : 4000);
    },
    [remove]
  );

  const api = useMemo<ToastApi>(
    () => ({
      notify,
      success: (m) => notify("success", m),
      error: (m) => notify("error", m),
      info: (m) => notify("info", m),
    }),
    [notify]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Toast viewport — announced politely to screen readers. */}
      <div
        className="pointer-events-none fixed right-4 top-4 z-50 flex w-full max-w-sm flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => remove(t.id)}
            className={`pointer-events-auto flex w-full items-start gap-2 rounded-lg border px-3 py-2.5 text-left text-sm shadow-md transition ${STYLES[t.kind]}`}
          >
            <span aria-hidden>{ICONS[t.kind]}</span>
            <span className="flex-1">{t.message}</span>
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
