import { useRef, useState, type DragEvent } from "react";
import { uploadFile, type UploadResult } from "../lib/api";

interface Props {
  onUploaded: (result: UploadResult) => void;
}

type Status = { kind: "idle" } | { kind: "uploading"; name: string } | { kind: "error"; message: string };

/**
 * Drag-and-drop (or click) upload area. Accepts a single PDF or .txt, sends it
 * to the server for indexing, and reports the result upward.
 */
export function UploadDropzone({ onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setStatus({ kind: "uploading", name: file.name });
    try {
      const result = await uploadFile(file);
      setStatus({ kind: "idle" });
      onUploaded(result);
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "Upload failed." });
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const uploading = status.kind === "uploading";

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload a PDF or text file"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={[
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition",
          dragging ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-white hover:border-brand-400",
        ].join(" ")}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,application/pdf,text/plain"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        {uploading ? (
          <p className="text-sm text-slate-600">
            <span className="mr-2 inline-block animate-spin">⏳</span>
            Indexing “{status.kind === "uploading" ? status.name : ""}”…
          </p>
        ) : (
          <>
            <p className="text-sm font-medium text-slate-700">
              Drop a PDF or .txt here, or click to choose
            </p>
            <p className="mt-1 text-xs text-slate-400">Max 15 MB</p>
          </>
        )}
      </div>

      {status.kind === "error" && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {status.message}
        </p>
      )}
    </div>
  );
}
