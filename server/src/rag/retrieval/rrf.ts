import type { RankedId } from "./types.js";

// ── Reciprocal Rank Fusion ──────────────────────────────────────────────────
//
// How do you combine a vector ranking and a BM25 ranking when their scores live
// on totally different scales (cosine ∈ [-1,1] vs unbounded BM25)? RRF sidesteps
// the scale problem entirely by using only each item's *rank position*:
//
//   fusedScore(d) = Σ_lists  1 / (k + rank_d_in_list)
//
// An item near the top of several lists accumulates a high fused score. k (=60,
// the value from the original paper) dampens the influence of very top ranks so
// one list can't dominate. It's simple, parameter-light, and works remarkably
// well — the standard way to merge heterogeneous rankers.

const K = 60;

export function reciprocalRankFusion(lists: RankedId[][], limit: number): RankedId[] {
  const fused = new Map<string, number>();

  for (const list of lists) {
    list.forEach((item, index) => {
      const rank = index + 1; // 1-based
      fused.set(item.id, (fused.get(item.id) ?? 0) + 1 / (K + rank));
    });
  }

  return [...fused.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
