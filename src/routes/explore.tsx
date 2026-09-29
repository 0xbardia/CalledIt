import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, indexerNotice, shortAddress, type Forecast, type IndexerStatus } from "@/lib/api";
import { StatusPill } from "@/components/receipt";

type ExploreSearch = {
  drafts?: boolean;
  status?: "OPEN" | "RESOLVED";
  cursor?: string;
};

function readSearch(search: Record<string, unknown>): ExploreSearch {
  const next: ExploreSearch = {};
  if (search.status === "OPEN" || search.status === "RESOLVED") next.status = search.status;
  const raw = typeof search.cursor === "string" ? search.cursor : "";
  if (/^[1-9]\d*:(?:0x[a-fA-F0-9]{40}|simulator)$/i.test(raw)) next.cursor = raw.toLowerCase();
  if (search.drafts === true || search.drafts === "true" || search.drafts === "1" || search.drafts === 1) next.drafts = true;
  return next;
}

export const Route = createFileRoute("/explore")({
  validateSearch: readSearch,
  component: Explore,
});

const filters = [
  ["All", undefined],
  ["Open", "OPEN"],
  ["Resolved", "RESOLVED"],
] as const;

function Explore() {
  const search = Route.useSearch();
  const [rows, setRows] = useState<Forecast[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [indexer, setIndexer] = useState<IndexerStatus>();
  const [error, setError] = useState("");
  // A redeployment keeps the same id space on a new address, so the record can
  // hold two rows that look identical. Say which contract each row came from.
  const multiContract = new Set((rows ?? []).map((row) => row.contract_address)).size > 1;

  useEffect(() => {
    const ctrl = new AbortController();
    const params = new URLSearchParams();
    if (search.drafts) params.set("drafts", "1");
    if (search.status) params.set("status", search.status);
    if (search.cursor) params.set("cursor", String(search.cursor));
    api<{ forecasts: Forecast[]; nextCursor: string | null; indexer: IndexerStatus }>(`/api/v1/forecasts?${params}`, { signal: ctrl.signal })
      .then((body) => {
        setRows(body.forecasts);
        setNext(body.nextCursor);
        setIndexer(body.indexer);
        setError("");
      })
      .catch((reason: Error) => {
        if (reason.name === "AbortError") return;
        setError(reason.message);
      });
    return () => ctrl.abort();
  }, [search.cursor, search.drafts, search.status]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker">Record</p>
          <h1 className="mt-2 text-5xl">The record</h1>
          <p className="mt-3 max-w-xl text-muted">Indexed forecasts. Drafts are local notes, not GenLayer locks, and stay out of reputation. Filters live in the address, so a refresh stays here.</p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <div className="seg" role="tablist" aria-label="Status">
            {filters.map(([label, status]) => (
              <Link
                key={label}
                to="/explore"
                search={{ ...(search.drafts ? { drafts: true } : {}), ...(status ? { status } : {}) }}
                className={(search.status ?? undefined) === status ? "is-on" : undefined}
                role="tab"
                aria-selected={(search.status ?? undefined) === status}
              >
                {label}
              </Link>
            ))}
          </div>
          <Link
            to="/explore"
            search={{ ...(search.status ? { status: search.status } : {}), ...(search.drafts ? {} : { drafts: true }) }}
            className="btn-ghost"
            aria-pressed={search.drafts}
          >
            {search.drafts ? "Drafts shown" : "Show local drafts"}
          </Link>
        </div>
      </div>
      {error ? <p className="note note-bad mt-6" role="alert">{error}</p> : null}
      {rows ? <p className={`mt-4 text-sm ${indexer?.current ? "text-muted" : "note note-warn"}`} role="status">{indexerNotice(indexer)}</p> : null}
      {rows === null && !error ? <p className="mt-8 text-muted">Loading the record…</p> : null}
      {rows && rows.length === 0 ? (
        <div className="glass mt-8 px-5 py-10">
          <p className="font-display text-3xl">{search.status || search.drafts ? "Nothing in this view." : "Nothing indexed yet."}</p>
          <p className="mt-2 text-muted">
            {search.status || search.drafts
              ? "The other forecasts are still on the record. This filter is only hiding them."
              : "When a wallet locks a forecast, it shows up here after the indexer reads the contract."}
          </p>
          <Link to="/forecast/new" className="btn-lock mt-5">Lock the first one</Link>
        </div>
      ) : null}
      {rows && rows.length > 0 ? (
      <ul className="cascade glass mt-6 divide-y divide-white/10 px-4">
        {rows?.map((row) => (
          <li key={`${row.network}-${row.contract_address}-${row.forecast_id}`}>
            <Link to="/forecast/$id" params={{ id: String(row.forecast_id) }} search={row.lock_state === "locked" ? { contract: row.contract_address } : {}} className="record-row flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
              <span>
                <span className="font-display text-2xl">{row.subject || row.original_text}</span>
                <span className="mt-1 block text-sm text-muted">{shortAddress(row.author)} · {row.deadline_iso} · {row.lock_state === "locked" ? "Locked" : "Draft"}</span>
                {multiContract ? (
                  // Two deployments of the same contract can hold the same
                  // id. Without this the record shows indistinguishable rows.
                  <span className="mt-1 block text-sm text-muted">Contract {shortAddress(row.contract_address)}</span>
                ) : null}
              </span>
              <StatusPill status={row.status} verdict={row.verdict} draft={row.lock_state !== "locked"} />
            </Link>
          </li>
        ))}
      </ul>
      ) : null}
      {next ? (
        <Link to="/explore" search={{ ...search, cursor: next }} className="btn-line mt-6">Older forecasts</Link>
      ) : null}
    </main>
  );
}
