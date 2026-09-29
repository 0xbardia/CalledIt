import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, indexerNotice, shortAddress, type IndexerStatus, type Reputation } from "@/lib/api";

export const Route = createFileRoute("/leaderboard")({ component: Board });

function Board() {
  const [leaders, setLeaders] = useState<Array<Reputation & { address: string }> | null>(null);
  const [formula, setFormula] = useState("");
  const [indexer, setIndexer] = useState<IndexerStatus>();
  const [error, setError] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();
    api<{ leaders: Array<Reputation & { address: string }>; formula: string; indexer: IndexerStatus }>("/api/v1/leaderboard", { signal: ctrl.signal })
      .then((body) => { setLeaders(body.leaders); setFormula(body.formula); setIndexer(body.indexer); })
      .catch((reason: Error) => {
        if (reason.name === "AbortError") return;
        setError(reason.message);
      });
    return () => ctrl.abort();
  }, []);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <p className="kicker">Board</p>
      <h1 className="mt-2 text-5xl">Leaderboard</h1>
      <p className="mt-3 text-muted">{formula || "Accuracy counts every scored forecast. Open calls are not misses, and drafts are ignored."}</p>
      {leaders ? <p className={`mt-3 text-sm ${indexer?.current ? "text-muted" : "note note-warn"}`} role="status">{indexerNotice(indexer)}</p> : null}
      {error ? <p className="mt-4" role="alert">{error}</p> : null}
      {leaders && leaders.length === 0 ? <p className="glass mt-8 px-4 py-8">No scored forecasts yet. The board stays empty rather than inventing ranks.</p> : null}
      <div className="glass mt-6 overflow-x-auto px-4">
        <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-[0.12em] text-muted">
          <tr><th className="py-2">Address</th><th>Accuracy</th><th>Correct</th><th>Incorrect</th><th>Open</th></tr>
        </thead>
        <tbody className="cascade">
          {leaders?.map((row) => (
            <tr key={row.address} className="border-t border-white/10">
              <td className="py-3"><Link to="/profile/$address" params={{ address: row.address }} className="underline">{shortAddress(row.address)}</Link></td>
              <td className="tabular-nums">{row.accuracy === null ? "Unscored" : `${Math.round(row.accuracy * 100)}%`}</td>
              <td className="tabular-nums">{row.correct}</td>
              <td className="tabular-nums">{row.incorrect}</td>
              <td className="tabular-nums">{row.open}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </main>
  );
}
