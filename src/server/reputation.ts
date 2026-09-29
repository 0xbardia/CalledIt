export type ForecastRow = {
  status: string;
  verdict: string;
  mode: string;
  source_verification: string;
  category: string;
  locked_at: number | null;
  deadline: number | null;
  chain_status: string;
  lock_state: string;
};

export type Reputation = {
  total: number;
  open: number;
  resolved: number;
  correct: number;
  incorrect: number;
  drafts: number;
  verifiedImports: number;
  accuracy: number | null;
  categories: Record<string, number>;
};

/** Accuracy uses only objectively scored on-chain verdicts. Open calls are not misses. */
export function reputationFrom(rows: ForecastRow[]): Reputation {
  const scored = rows.filter((row) => row.lock_state === "locked" && row.chain_status !== "simulated");
  const correct = scored.filter((row) => row.verdict === "CORRECT").length;
  const incorrect = scored.filter((row) => row.verdict === "INCORRECT").length;
  const denominator = correct + incorrect;
  const categories: Record<string, number> = {};
  for (const row of scored) {
    if (!row.category) continue;
    categories[row.category] = (categories[row.category] ?? 0) + 1;
  }
  return {
    total: scored.length,
    open: scored.filter((row) => row.status === "OPEN").length,
    resolved: scored.filter((row) => row.status === "RESOLVED").length,
    correct,
    incorrect,
    drafts: rows.filter((row) => row.lock_state === "draft").length,
    verifiedImports: scored.filter((row) => row.source_verification === "VERIFIED").length,
    accuracy: denominator === 0 ? null : correct / denominator,
    categories,
  };
}
