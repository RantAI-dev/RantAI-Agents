export interface RerankCandidate {
  id: string;
  text: string;
  originalRank: number;
  originalScore: number;
}

export interface RerankedResult {
  id: string;
  finalRank: number;
  score: number;
}

export interface Reranker {
  readonly name: string;
  rerank(query: string, candidates: RerankCandidate[], finalK: number): Promise<RerankedResult[]>;
}
