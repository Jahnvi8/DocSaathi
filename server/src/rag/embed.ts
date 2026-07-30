import { TaskType } from "@google/generative-ai";
import { config } from "../config.js";
import { getGenAI } from "../llm/gemini.js";

// Gemini's embedding model supports "task types" that tune the vector for its
// intended use. Documents and queries get embedded slightly differently, which
// measurably improves retrieval — a nice, cheap quality win.
//   - RETRIEVAL_DOCUMENT → for the stored chunks
//   - RETRIEVAL_QUERY    → for the user's question

async function embed(text: string, taskType: TaskType): Promise<number[]> {
  const model = getGenAI().getGenerativeModel({ model: config.embedModel });
  const res = await model.embedContent({
    content: { role: "user", parts: [{ text }] },
    taskType,
  });
  return res.embedding.values;
}

/** Embed many document chunks (sequentially — simple and rate-limit friendly for an MVP). */
export async function embedChunks(texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (const text of texts) {
    vectors.push(await embed(text, TaskType.RETRIEVAL_DOCUMENT));
  }
  return vectors;
}

/** Embed a single user question for similarity search. */
export function embedQuery(text: string): Promise<number[]> {
  return embed(text, TaskType.RETRIEVAL_QUERY);
}
