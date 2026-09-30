import { createFileRoute, Link } from "@tanstack/react-router";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { Receipt } from "@/components/receipt";
import { api, when, type Forecast } from "@/lib/api";
import { sendResolve, type TxPhase } from "@/lib/chain";
import { evidenceList, preflightEvidence } from "@/lib/preflight";
import { explainChainError } from "@/lib/tx-error";

type ForecastSearch = { contract?: string };

export const Route = createFileRoute("/forecast/$id")({
  validateSearch: (search: Record<string, unknown>): ForecastSearch => {
    const contract = typeof search.contract === "string" ? search.contract.toLowerCase() : "";
    return contract ? { contract } : {};
  },
  component: ForecastPage,
});

type Protocol = {
  contractAddress: string;
  chainId: number;
  network: string;
  rpcUrl: string;
  contractConfigured: boolean;
  resolutionDomains?: string[];
};

function ForecastPage() {
  const { id } = Route.useParams();
  const { contract } = Route.useSearch();
  const apiPath = `/api/v1/forecasts/${id}${contract ? `?contract=${encodeURIComponent(contract)}` : ""}`;
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [error, setError] = useState("");

  function load() {
    return api<{ forecast: Forecast }>(apiPath)
      .then((body) => {
        setForecast(body.forecast);
        setError("");
      })
      .catch((reason: Error) => setError(reason.message));
  }

  useEffect(() => {
    const ctrl = new AbortController();
    let gone = false;
    setForecast(null);
    setError("");
    api<{ forecast: Forecast }>(apiPath, { signal: ctrl.signal })
      .then((body) => {
        if (!gone) setForecast(body.forecast);
      })
      .catch((reason: Error) => {
        if (gone || reason.name === "AbortError") return;
        setError(reason.message);
      });
    return () => {
      gone = true;
      ctrl.abort();
    };
  }, [apiPath]);

  if (error && !forecast) {
    return <main className="mx-auto max-w-3xl px-4 py-16"><p role="alert" className="note note-bad">{error}</p></main>;
  }
  if (!forecast) return <main className="mx-auto max-w-3xl px-4 py-16 text-muted">Loading receipt…</main>;

  const locked = forecast.lock_state === "locked";
  const coded = locked && forecast.category === "PRICE_THRESHOLD";
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Receipt forecast={forecast} />
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Panel kicker="Your words" title="The sentence" body={forecast.original_text} />
        <Panel kicker="Frozen reading" title="The reading" body={locked ? forecast.canonical || forecast.criteria : "Not frozen. This draft never went through consensus."} />
        <Panel kicker="After evidence" title="The verdict" body={forecast.verdict ? `${forecast.verdict}, resolved ${when(forecast.resolved_at)}` : locked ? "Open. No verdict yet." : "Drafts are not resolved."} />
      </div>
      {locked ? (
        <p className="note mt-6">
          {coded
            ? "This reading was sealed in code. The sentence named one asset, one price, and one direction, so validators do not ask a model and cannot split on wording."
            : "Validators each produced a reading. They accepted the leader only where the subject, the comparison, and the target matched. The wording did not have to match."}
        </p>
      ) : null}
      {locked && forecast.status === "OPEN" ? <Resolve forecast={forecast} onResolved={() => void load()} /> : null}
      <dl className="mt-8 grid gap-4 text-sm sm:grid-cols-2">
        <Field label="Criteria" value={forecast.criteria || "None"} />
        <Field label="Evidence" value={forecast.evidence || "None yet"} />
        <Field label="Network" value={forecast.network} />
        <Field label="Contract" value={forecast.contract_address} />
        <Field label="Chain status" value={chainLabel(forecast.chain_status)} />
        <Field
          label="Transaction"
          value={
            forecast.tx_hash ||
            // Explain the gap rather than leaving a bare dash on the one page
            // people share as proof. A lock made in this app always has its
            // hash attached; one made by a script or another client does not.
            "Not recorded. This lock was not made through this site, so the indexer never saw its transaction. The forecast and the verdict above are read from the contract itself."
          }
        />
      </dl>
      <p className="mt-6 text-sm">
        <Link to="/profile/$address" params={{ address: forecast.author }} className="underline">Author profile</Link>
      </p>
    </main>
  );
}

function Resolve({ forecast, onResolved }: { forecast: Forecast; onResolved: () => void }) {
  const account = useAccount();
  const { openConnectModal } = useConnectModal();
  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [mounted, setMounted] = useState(false);
  const [urls, setUrls] = useState("");
  const [phase, setPhase] = useState<TxPhase>("idle");
  const [notice, setNotice] = useState("");
  const [protocolError, setProtocolError] = useState("");
  const submitting = useRef(false);
  const snapshot = (forecast.policy_snapshot || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const domains = snapshot.length > 0 ? snapshot : protocol?.resolutionDomains;
  const check = preflightEvidence(urls, domains);
  const connected = mounted && Boolean(account.address && account.connector);

  useEffect(() => {
    setMounted(true);
    api<Protocol>("/api/v1/protocol").then(setProtocol).catch((reason: Error) => setProtocolError(reason.message));
  }, []);

  async function submit() {
    if (!protocol?.contractConfigured || !check.ok) return;
    if (submitting.current) return;
    if (!account.address || !account.connector) {
      openConnectModal?.();
      return;
    }
    submitting.current = true;
    setNotice("");
    setPhase("approval");
    try {
      const provider = await account.connector.getProvider();
      if (!provider) throw new Error("The connected wallet did not provide a signer.");
      const tx = await sendResolve({
        config: protocol,
        account: account.address,
        provider,
        forecastId: forecast.forecast_id,
        evidence: evidenceList(urls),
        onSubmitted: () => setPhase("submitted"),
      });
      setPhase("accepted");
      setNotice(tx.verdict ? `Recorded ${tx.verdict}. Resolution transaction: ${tx.hash}.` : `The verdict was recorded. Resolution transaction: ${tx.hash}.`);
      try {
        await api("/api/v1/indexer/sync", { method: "POST", body: "{}" });
        onResolved();
      } catch {
        setNotice("GenLayer recorded the verdict. The history index is delayed and will catch up on its next read.");
      }
    } catch (reason) {
      const message = explainChainError(reason instanceof Error ? reason.message : "The resolution did not go through.");
      if (/not rejected/i.test(message)) {
        setPhase("submitted");
        setNotice(message);
        void api("/api/v1/indexer/sync", { method: "POST", body: "{}" }).catch(() => undefined);
        return;
      }
      setPhase("failed");
      setNotice(message);
    } finally {
      submitting.current = false;
    }
  }

  const signLabel = !protocol
    ? protocolError ? "Protocol unavailable" : "Checking protocol"
    : !protocol.contractConfigured
      ? "Contract is not configured"
      : !connected ? "Connect wallet to submit evidence" : phase === "approval" ? "Waiting for your signature" : phase === "submitted" ? "Waiting for consensus" : phase === "accepted" ? "Verdict recorded" : "Sign the resolution";

  if (protocol && forecast.contract_address.toLowerCase() !== protocol.contractAddress.toLowerCase()) {
    return (
      <section className="glass mt-6 p-5 sm:p-6">
        <p className="kicker">Archived contract</p>
        <p className="mt-2 text-sm leading-6 text-muted" role="status">
          This receipt is preserved in history and reputation. It belongs to a previous contract, so this app shows it read-only.
        </p>
      </section>
    );
  }

  return (
    <section className="glass mt-6 p-5 sm:p-6">
      <p className="kicker">Resolution</p>
      <h2 className="mt-2 text-3xl">Submit the pages that prove it.</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
        Your wallet signs <span className="text-ink">resolve_forecast</span>. Use one to three https pages from the list frozen at lock. A correct call can land early. An incorrect one cannot, until the deadline. If the pages do not prove it, the transaction reverts and this forecast stays open.
      </p>
      {domains ? <p className="mt-3 text-sm leading-6 text-muted">Allowed now: {domains.join(", ")}.</p> : null}
      {protocolError ? <p className="note note-bad mt-3" role="alert">{protocolError}</p> : null}
      <label className="mt-4 block">
        <span className="text-sm font-semibold">Evidence pages</span>
        <textarea value={urls} onChange={(event) => setUrls(event.target.value)} rows={3} placeholder="https://www.coindesk.com/price/bitcoin" className="field" />
      </label>
      {urls.trim() && !check.ok ? <p className="note note-warn mt-3" role="status">{check.message}</p> : null}
      {urls.trim() && check.ok ? <p className="note note-good mt-3">These addresses are on the frozen list. The chain still has to read them.</p> : null}
      {notice ? <p className={phase === "failed" ? "note note-bad mt-3" : "note mt-3"} role={phase === "failed" ? "alert" : "status"}>{notice}</p> : null}
      <button type="button" disabled={!check.ok || !protocol?.contractConfigured || phase === "approval" || phase === "submitted" || phase === "accepted"} onClick={() => void submit()} className="btn-lock mt-4 disabled:opacity-50">
        {signLabel}
      </button>
    </section>
  );
}

function Panel({ kicker, title, body }: { kicker: string; title: string; body: string }) {
  return (
    <section className="glass p-4">
      <p className="kicker text-ochre">{kicker}</p>
      <h2 className="mt-2 text-2xl">{title}</h2>
      <p className="mt-3 text-sm leading-6">{body}</p>
    </section>
  );
}

function chainLabel(value: string): string {
  if (value === "finalized") return "Final";
  if (value === "accepted") return "Accepted";
  if (value === "pending") return "Pending";
  if (value === "simulated") return "Local only";
  return value || "Not recorded";
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-white/10 pt-3">
      <dt className="text-xs uppercase tracking-[0.12em] text-muted">{label}</dt>
      <dd className="mt-1 break-all">{value}</dd>
    </div>
  );
}
