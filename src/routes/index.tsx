import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Receipt } from "@/components/receipt";
import { api, indexerNotice, type Forecast, type IndexerStatus } from "@/lib/api";

export const Route = createFileRoute("/")({ component: Home });

const example: Forecast = {
  network: "example",
  contract_address: "example",
  forecast_id: 842,
  author: "0x8c1a00000000000000000000000000000000a91e",
  mode: "NATIVE",
  original_text: "SOL will trade above $500 before June 30, 2027.",
  source_url: "",
  source_verification: "NOT_APPLICABLE",
  locked_at: 1761480000,
  deadline: 1811894399,
  deadline_iso: "2027-06-30",
  category: "PRICE_THRESHOLD",
  subject: "SOL",
  predicate: "spot price exceeds a stated threshold",
  comparator: ">",
  target_value: "500",
  unit: "USD",
  occurrence: "THRESHOLD",
  canonical: "SOL price exceeds 500 USD before 2027-06-30.",
  criteria: "CORRECT if an allowed price source shows SOL above 500 USD on or before 2027-06-30.",
  ambiguity: "CLEAR",
  status: "OPEN",
  verdict: "",
  resolved_at: null,
  evidence: "",
  chain_status: "accepted",
  lock_state: "locked",
  tx_hash: null,
};

function Home() {
  const [live, setLive] = useState<Forecast | null>(null);
  const [indexer, setIndexer] = useState<IndexerStatus>();
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const ctrl = new AbortController();
    api<{ forecasts: Forecast[]; indexer: IndexerStatus }>("/api/v1/forecasts", { signal: ctrl.signal })
      .then((body) => { setLive(body.forecasts.find((row) => row.lock_state === "locked") ?? null); setIndexer(body.indexer); })
      .catch((reason: Error) => {
        if (reason.name === "AbortError") return;
        setLive(null);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setSettled(true);
      });
    return () => ctrl.abort();
  }, []);

  return (
    <main>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
        <div>
          <p className="kicker rise">A public record for people who call things early.</p>
          <h1 className="mt-4 max-w-xl font-display text-5xl leading-[0.96] text-ink sm:text-7xl">
            <span className="hero-line">Say it once.</span>
            <span className="hero-line d2">Then it stays said.</span>
          </h1>
          <p className="rise d2 mt-5 max-w-lg text-lg leading-8 text-muted">
            CalledIt locks the meaning of a forecast before the outcome exists. Your sentence, the reading, and the verdict stay in three separate places. None of them can be edited later.
          </p>
          <div className="rise d3 mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to="/forecast/new" className="btn-lock">Lock a forecast</Link>
            <Link to="/explore" className="btn-line">See the record</Link>
          </div>
          <p className="rise d3 mt-5 max-w-md text-sm leading-6 text-muted">
            The lock is a GenLayer transaction. Your wallet signs it. This website does not have a key, and it cannot sign for you.
          </p>
        </div>
        <div className="rise d2">
          {!settled ? (
            <div className="receipt-ghost glass" aria-busy="true" aria-label="Loading the latest receipt" />
          ) : live ? (
            <>
              <p className={`mb-3 text-sm ${indexer?.current ? "text-muted" : "note note-warn"}`} role="status">{indexerNotice(indexer)}</p>
              <Link to="/forecast/$id" params={{ id: String(live.forecast_id) }} search={{ contract: live.contract_address }} className="lift block">
                <Receipt forecast={live} />
              </Link>
            </>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">An example receipt. It is labeled so it cannot be mistaken for a live call.</p>
              <Receipt forecast={example} example />
            </>
          )}
        </div>
      </section>

      <section id="how" className="rise d1 mx-4 sm:mx-6">
        <div className="glass mx-auto grid max-w-6xl gap-10 px-6 py-12 lg:grid-cols-[0.8fr_1.2fr] lg:px-10">
          <h2 className="text-4xl leading-tight">How a forecast becomes a receipt</h2>
          <ol className="steps space-y-6 text-lg leading-8">
            <li>
              <span className="font-semibold text-ink">Write a sentence that already contains the date. </span>
              <span className="text-muted">“Soon” and a bare “Q1” are refused. The chain will not invent a deadline you did not write.</span>
            </li>
            <li>
              <span className="font-semibold text-ink">You sign the lock in your own wallet. </span>
              <span className="text-muted">The wallet you connected sends the transaction. Validators freeze the subject, the comparison, and the target.</span>
            </li>
            <li>
              <span className="font-semibold text-ink">Only an allowlisted source can close it. </span>
              <span className="text-muted">A miss stays on the record. Open forecasts are not counted as misses. Accuracy is the whole history, not the calls you choose to show.</span>
            </li>
          </ol>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-16 sm:px-6 md:grid-cols-2">
        <figure className="glass lift p-6">
          <figcaption className="kicker">This will not lock</figcaption>
          <blockquote className="mt-3 font-display text-3xl italic leading-snug">“ETH is going crazy soon.”</blockquote>
          <p className="mt-4 leading-7 text-muted">No number. No date. CalledIt rejects it instead of guessing a price and a quarter for you.</p>
        </figure>
        <figure className="glass lift p-6">
          <figcaption className="text-sm font-semibold text-moss">This can lock</figcaption>
          <blockquote className="mt-3 font-display text-3xl italic leading-snug">“BTC will trade above $150,000 before December 31, 2027.”</blockquote>
          <p className="mt-4 leading-7 text-muted">The asset, the direction, the number, and the day are all in the sentence. That is what gets locked.</p>
        </figure>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-8 sm:px-6 lg:grid-cols-2">
        <div>
          <h2 className="text-4xl">Where the project goes next</h2>
          <p className="mt-4 leading-7 text-muted">
            What ships today is the lock, the receipt, and a score that does not hide the losses. Later work is written down so it is not confused with what you can already use.
          </p>
          <p className="mt-6 flex flex-wrap gap-4 text-sm font-semibold">
            <Link to="/roadmap" className="underline">Read the roadmap</Link>
            <Link to="/docs" className="underline">Read the docs</Link>
            <Link to="/security" className="underline">Read the security notes</Link>
          </p>
        </div>
        <dl className="glass divide-y divide-white/10 px-5">
          {[
            ["Now", "Native and imported forecasts, frozen readings, allowlisted evidence, and a public board."],
            ["Next", "Clearer event types, and a read API that stays a mirror of the contract."],
            ["Not now", "No token, no bond, and no way to delete a forecast you regret."],
          ].map(([title, body]) => (
            <div key={title} className="py-4">
              <dt className="font-semibold">{title}</dt>
              <dd className="mt-1 text-muted">{body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <h2 className="text-4xl">Before you lock one</h2>
        <div className="glass mt-6 px-5">
          {[
            ["Does CalledIt hold my funds or my key?", "No. You sign the lock in your wallet. This site stores an index. It cannot move funds and it cannot sign."],
            ["Can I delete a bad call?", "No. That is the product. You can publish a new forecast. The old one stays."],
            ["What if the evidence site is down?", "The forecast stays open. Missing evidence is not turned into a win or a loss."],
            ["Is an imported post the same as one I type here?", "No. An import has to be on an allowlisted site, and the sentence has to appear on that page."],
          ].map(([q, a]) => (
            <details key={q} className="faq py-4">
              <summary className="text-lg font-semibold">{q}</summary>
              <p className="mt-2 max-w-3xl leading-7 text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
