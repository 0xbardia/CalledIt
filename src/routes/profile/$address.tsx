import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, indexerNotice, shortAddress, type Forecast, type IndexerStatus, type Reputation } from "@/lib/api";
import { StatusPill } from "@/components/receipt";

export const Route = createFileRoute("/profile/$address")({ component: Profile });

function Profile() {
  const { address } = Route.useParams();
  const [data, setData] = useState<{ forecasts: Forecast[]; stats: Reputation; indexer: IndexerStatus } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();
    api<{ forecasts: Forecast[]; stats: Reputation; indexer: IndexerStatus }>(`/api/v1/profiles/${address}`, { signal: ctrl.signal })
      .then(setData)
      .catch((reason: Error) => {
        if (reason.name === "AbortError") return;
        setError(reason.message);
      });
    return () => ctrl.abort();
  }, [address]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <p className="text-xs uppercase tracking-[0.16em] text-muted">Profile</p>
      <h1 className="mt-2 break-all font-display text-4xl sm:text-5xl">{shortAddress(address)}</h1>
      {error ? <p className="mt-4" role="alert">{error}</p> : null}
      {data ? <p className={`mt-4 text-sm ${data.indexer.current ? "text-muted" : "note note-warn"}`} role="status">{indexerNotice(data.indexer)}</p> : null}
      {data ? <Stats stats={data.stats} /> : !error ? <p className="mt-6 text-muted">Loading history…</p> : null}
      {data ? (
        <ul className="glass mt-8 divide-y divide-white/10 px-4">
          {data.forecasts.map((row) => (
            <li key={`${row.network}-${row.contract_address}-${row.forecast_id}`} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
              <span>
                <Link to="/forecast/$id" params={{ id: String(row.forecast_id) }} search={row.lock_state === "locked" ? { contract: row.contract_address } : {}} className="font-display text-2xl break-words">{row.subject || row.original_text}</Link>
                {/* Two deployments of the same contract can hold the same id.
                    Without this, one author's history shows identical rows. */}
                {new Set(data.forecasts.map((item) => item.contract_address)).size > 1 ? (
                  <span className="mt-1 block text-sm text-muted">Contract {shortAddress(row.contract_address)} · {row.deadline_iso}</span>
                ) : null}
              </span>
              <StatusPill status={row.status} verdict={row.verdict} draft={row.lock_state !== "locked"} />
            </li>
          ))}
        </ul>
      ) : null}
      {data && data.forecasts.length === 0 ? <p className="mt-6 text-muted">No forecasts for this address.</p> : null}
    </main>
  );
}

export function Stats({ stats }: { stats: Reputation }) {
  const accuracy = stats.accuracy === null ? "Unscored" : `${Math.round(stats.accuracy * 100)}%`;
  const items = [
    ["Locked", stats.total],
    ["Open", stats.open],
    ["Correct", stats.correct],
    ["Incorrect", stats.incorrect],
    ["Accuracy", accuracy],
    ["Drafts", stats.drafts],
  ] as const;
  return (
    <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="stat">
          <dt className="text-xs uppercase tracking-[0.14em] text-muted">{label}</dt>
          <dd className="mt-1 font-display text-3xl tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
