import { GoogleGenerativeAI } from "@google/generative-ai";
import { config, assertApiKey } from "../config.js";
import type { ScoredChunk } from "../rag/store.js";

// A single lazily-created SDK client, reused across requests. We create it lazily
// (rather than at import time) so the server can still boot and serve /api/health
// when no API key is configured.
let client: GoogleGenerativeAI | null = null;

export function getGenAI(): GoogleGenerativeAI {
  assertApiKey(); // throws a clear message if GEMINI_API_KEY is missing
  if (!client) {
    client = new GoogleGenerativeAI(config.geminiApiKey);
  }
  return client;
}

// ── Resilience: retry with backoff ──────────────────────────────────────────
// The Gemini free tier is rate-limited (429). Rather than fail the first time we
// hit a limit, we retry with backoff. When the API tells us how long to wait
// (its error includes a `retryDelay`), we honor that; otherwise we back off
// exponentially with jitter. This is what lets the eval harness hammer the API
// without falling over, and makes interactive chat resilient to brief spikes.

interface RetryOptions {
  retries?: number;
  maxDelayMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** True for transient errors worth retrying (rate limits / server overload). */
function isRetriable(message: string): boolean {
  return /\b429\b|too many requests|quota|\b503\b|overloaded|unavailable/i.test(message);
}

/** Pull a suggested wait (ms) out of the Gemini error, if it provided one. */
function parseRetryDelayMs(message: string): number | null {
  const fromField = message.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/);
  if (fromField) return Math.ceil(parseFloat(fromField[1]) * 1000);
  const fromText = message.match(/retry in ([\d.]+)s/i);
  if (fromText) return Math.ceil(parseFloat(fromText[1]) * 1000);
  return null;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 3;
  const maxDelayMs = opts.maxDelayMs ?? 20_000;

  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt >= retries || !isRetriable(message)) throw err;

      const suggested = parseRetryDelayMs(message);
      const exponential = Math.round(1000 * 2 ** attempt * (1 + Math.random() * 0.3));
      const delay = Math.min(maxDelayMs, suggested ?? exponential);

      console.warn(
        `[gemini] retriable error (attempt ${attempt + 1}/${retries}), waiting ${delay}ms…`
      );
      await sleep(delay);
      attempt += 1;
    }
  }
}

// ── Structured output: force JSON ───────────────────────────────────────────
// Query rewriting, reranking, and eval judging all need STRUCTURED output, not
// prose. We set responseMimeType to application/json (and temperature 0 for
// determinism) so Gemini returns parseable JSON, then parse it defensively.

function stripCodeFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

export async function generateJson<T = unknown>(
  prompt: string,
  opts: { system?: string; retries?: number; maxDelayMs?: number } = {}
): Promise<T> {
  const model = getGenAI().getGenerativeModel({
    model: config.chatModel,
    ...(opts.system ? { systemInstruction: opts.system } : {}),
    generationConfig: { responseMimeType: "application/json", temperature: 0 },
  });

  const text = await withRetry(
    async () => {
      const res = await model.generateContent(prompt);
      return res.response.text();
    },
    { retries: opts.retries, maxDelayMs: opts.maxDelayMs }
  );

  return JSON.parse(stripCodeFences(text)) as T;
}

// The system instruction defines DocSaathi's behavior: stay grounded in the
// retrieved sources, cite by number, and — crucially for this app — reply in the
// SAME language and script the user asked in (English / Hindi / Hinglish).
const SYSTEM_INSTRUCTION = `You are DocSaathi, an assistant that answers questions about the user's uploaded document.

Rules:
1. Answer ONLY using the information in the numbered sources provided. Do not use outside knowledge.
2. If the answer is not contained in the sources, say clearly that you could not find it in the document. Never invent facts.
3. Cite your sources inline using bracketed numbers that match the source numbers, e.g. "... increased by 20% [2]." Place a citation right after the sentence it supports. You may cite more than one source.
4. LANGUAGE: Reply in the SAME language and script as the user's question.
   - English question → answer in English.
   - Hindi question (Devanagari script) → answer in Hindi (Devanagari).
   - Hinglish question (Hindi written in Latin script / mixed) → answer in Hinglish, matching their casual mixed style.
5. Be concise, accurate, and helpful.`;

/** Build the user-turn prompt: the numbered sources followed by the question. */
function buildPrompt(question: string, scored: ScoredChunk[]): string {
  const sources = scored
    .map((s, i) => {
      const loc = s.chunk.page != null ? `${s.chunk.source}, page ${s.chunk.page}` : s.chunk.source;
      return `[${i + 1}] (${loc})\n${s.chunk.text}`;
    })
    .join("\n\n");

  return `Sources:\n${sources}\n\nQuestion: ${question}`;
}

/**
 * Stream the model's answer token-by-token. This is an async generator, so the
 * route can `for await` over it and forward each piece to the client via SSE.
 */
export async function* streamAnswer(
  question: string,
  scored: ScoredChunk[]
): AsyncGenerator<string> {
  const model = getGenAI().getGenerativeModel({
    model: config.chatModel,
    systemInstruction: SYSTEM_INSTRUCTION,
  });

  // Retry only the initial request (before any tokens have been sent). Once the
  // stream is flowing we don't retry mid-answer.
  const result = await withRetry(() =>
    model.generateContentStream(buildPrompt(question, scored))
  );
  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) yield text;
  }
}

/** Non-streaming variant of streamAnswer — returns the full answer text. Used by the eval harness. */
export async function generateAnswer(question: string, scored: ScoredChunk[]): Promise<string> {
  const model = getGenAI().getGenerativeModel({
    model: config.chatModel,
    systemInstruction: SYSTEM_INSTRUCTION,
  });
  return withRetry(async () => {
    const res = await model.generateContent(buildPrompt(question, scored));
    return res.response.text();
  });
}
