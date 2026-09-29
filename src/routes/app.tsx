import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, indexerNotice, type Forecast, type IndexerStatus } from "@/lib/api";

export const Route = createFileRoute("/app")({ component: AppHome });

function AppHome() {
  const [rows, setRows] = useState<Forecast[] | null>(null);
  const [indexer, setIndexer] = useState<IndexerStatus>();
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ activity: Forecast[]; indexer: IndexerStatus }>("/api/v1/activity")
      .then((body) => { setRows(body.activity); setIndexer(body.indexer); })
      .catch((reason: Error) => setError(reason.message));
  }, []);
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-5xl">The desk</h1>
      <p className="mt-3 max-w-2xl text-muted">Lock a forecast from your wallet, then open the receipt. This page reads the index. It does not pick a verdict. Refresh stays on this address.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/forecast/new" className="btn-lock">New forecast</Link>
        <Link to="/explore" className="btn-line">Explore</Link>
      </div>
      <h2 className="mt-10 text-3xl">Latest on the record</h2>
      {error ? <p className="note note-bad mt-3" role="alert">{error}</p> : null}
      {rows && !error ? <p className={`mt-3 text-sm ${indexer?.current ? "text-muted" : "note note-warn"}`} role="status">{indexerNotice(indexer)}</p> : null}
      {rows === null && !error ? <p className="mt-3 text-muted">Loading…</p> : null}
      {rows && !error && rows.length === 0 ? <p className="mt-3 text-muted">No activity yet.</p> : null}
      <ul className="glass mt-4 divide-y divide-white/10 px-4">
        {rows && !error ? rows.map((row) => (
          <li key={`${row.network}-${row.contract_address}-${row.forecast_id}`} className="py-3">
            <Link to="/forecast/$id" params={{ id: String(row.forecast_id) }} search={row.lock_state === "locked" ? { contract: row.contract_address } : {}}>{row.subject || row.original_text}</Link>
            <span className="ml-2 text-sm text-muted">{row.lock_state === "locked" ? row.status : "draft"}</span>
          </li>
        )) : null}
      </ul>
    </main>
  );
}
