/** A document id with a relevance score, as produced by a ranking stage. */
export interface RankedId {
  id: string;
  score: number;
}
