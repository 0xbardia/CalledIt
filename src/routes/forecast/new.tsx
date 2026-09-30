import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useChainModal, useConnectModal } from "@rainbow-me/rainbowkit";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { api } from "@/lib/api";
import { sendLock, type TxPhase } from "@/lib/chain";
import { preflightForecast, preflightSourceUrl } from "@/lib/preflight";
import { explainChainError } from "@/lib/tx-error";

type NewSearch = { mode?: "imported" };

export const Route = createFileRoute("/forecast/new")({
  validateSearch: (search: Record<string, unknown>): NewSearch => (
    search.mode === "imported" ? { mode: "imported" } : {}
  ),
  component: NewForecast,
});

type Protocol = {
  contractAddress: string;
  chainId: number;
  network: string;
  rpcUrl: string;
  allowSimulator: boolean;
  contractConfigured: boolean;
  importDomains?: string[];
};

function NewForecast() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const account = useAccount();
  const { openConnectModal } = useConnectModal();
  // Authoritative network check happens in lockOnchain against the provider
  // itself. This flag only drives the early, visible warning.
  const { openChainModal } = useChainModal();
  const [text, setText] = useState("BTC will trade above $150,000 before December 31, 2027.");
  const [deadline, setDeadline] = useState("2027-12-31");
  const [sourceUrl, setSourceUrl] = useState("");
  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<TxPhase>("idle");
  const [hash, setHash] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const mode = search.mode === "imported" ? "IMPORTED" : "NATIVE";
  const sentence = preflightForecast(text, deadline);
  const source = mode === "IMPORTED" ? preflightSourceUrl(sourceUrl, protocol?.importDomains) : ({ ok: true } as const);
  const check = !sentence.ok ? sentence : !source.ok ? source : ({ ok: true } as const);
  const connected = mounted && Boolean(account.address && account.connector);
  // A wallet on another chain cannot lock anything. Catch it before the
  // signature, instead of letting the send fail with a network-shaped error.
  // `account.chainId` is the chain the wallet itself reports.
  const wrongNetwork = connected && Boolean(protocol) && Number(account.chainId) !== protocol?.chainId;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    api<Protocol>("/api/v1/protocol").then(setProtocol).catch((reason: Error) => setError(reason.message));
  }, []);

  async function lockOnchain() {
    if (!protocol?.contractConfigured) return;
    if (submitting.current) return;
    if (wrongNetwork) {
      setError("Your wallet is on the wrong network. Nothing was sent and nothing was locked. Switch it to the network named above, then try again.");
      return;
    }
    if (!account.address || !account.connector) {
      openConnectModal?.();
      return;
    }
    // Ask the wallet which network it is really on, not the cached hook value.
    // A send on the wrong chain is the one failure a user cannot undo.
    try {
      const signer = (await account.connector.getProvider()) as { request?: (args: { method: string }) => Promise<unknown> } | undefined;
      const reported = (await signer?.request?.({ method: "eth_chainId" })) as string | undefined;
      if (reported && Number(reported) !== protocol.chainId) {
        setError("Your wallet is on the wrong network. Nothing was sent and nothing was locked. Switch it to the network named above, then try again.");
        return;
      }
    } catch {
      // A wallet that will not report its chain is not a reason to block the
      // send; the send itself still fails safely and says so.
    }
    submitting.current = true;
    setError("");
    setHash("");
    setPhase("approval");
    try {
      const provider = await account.connector.getProvider();
      if (!provider) throw new Error("The connected wallet did not provide a signer.");
      const tx = await sendLock({
        config: protocol,
        account: account.address,
        provider,
        text,
        deadline,
        mode,
        sourceUrl,
        onSubmitted: (submitted) => {
          setHash(submitted);
          setPhase("submitted");
        },
      });
      setHash(tx.hash);
      setPhase("accepted");
      if (tx.forecastId) {
        try {
          await api("/api/v1/indexer/sync", { method: "POST", body: "{}" });
          await api("/api/v1/indexer/transactions", {
            method: "POST",
            body: JSON.stringify({ hash: tx.hash, forecastId: tx.forecastId }),
          });
          await navigate({ to: "/forecast/$id", params: { id: String(tx.forecastId) }, search: { contract: protocol.contractAddress } });
        } catch {
          setError("The lock was accepted by GenLayer. The receipt index is delayed and will catch up on its next read.");
        }
      } else {
        setError("The lock was accepted by GenLayer, but its forecast id was not returned. The indexer will retry the read.");
      }
    } catch (reason) {
      const message = explainChainError(reason instanceof Error ? reason.message : "The wallet rejected the forecast.");
      if (/not rejected/i.test(message)) {
        setPhase("submitted");
        setError(message);
        void api("/api/v1/indexer/sync", { method: "POST", body: "{}" }).catch(() => undefined);
        return;
      }
      setPhase("failed");
      setError(message);
    } finally {
      submitting.current = false;
    }
  }

  async function saveDraft() {
    if (!account.address) {
      openConnectModal?.();
      setError("Connect a wallet so the draft has an author. A draft is not a lock and does not spend funds.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const body = await api<{ forecastId: number }>("/api/v1/simulator/forecasts", {
        method: "POST",
        body: JSON.stringify({ text, deadline, mode, sourceUrl, address: account.address }),
      });
      await navigate({ to: "/forecast/$id", params: { id: String(body.forecastId) } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the draft.");
    } finally {
      setSaving(false);
    }
  }

  const signLabel = !protocol
    ? error ? "Protocol unavailable" : "Checking protocol"
    : !protocol.contractConfigured
      ? "Contract is not configured"
    : !connected
      ? "Connect wallet to sign"
      : phase === "approval"
        ? "Waiting for your signature"
    : phase === "submitted"
          ? "Waiting for consensus"
          : phase === "accepted"
            ? "Lock accepted"
            : "Sign with your wallet";

  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.15fr_0.85fr]">
      <form className="glass space-y-5 p-5 sm:p-7" onSubmit={(event) => event.preventDefault()}>
        <p className="kicker">New forecast</p>
        <h1 className="text-5xl">Write it, then sign it.</h1>
        <p className="max-w-xl text-lg leading-8 text-muted">
          Pressing the button opens your wallet and asks you to sign <span className="text-ink">lock_native_forecast</span> or <span className="text-ink">lock_imported_forecast</span>. Nothing is locked until you approve it.
        </p>
        <div className="seg" role="tablist" aria-label="Forecast mode">
          <button type="button" className={mode === "NATIVE" ? "is-on" : undefined} aria-pressed={mode === "NATIVE"} onClick={() => navigate({ to: "/forecast/new", search: {} })}>
            Write it here
          </button>
          <button type="button" className={mode === "IMPORTED" ? "is-on" : undefined} aria-pressed={mode === "IMPORTED"} onClick={() => navigate({ to: "/forecast/new", search: { mode: "imported" } })}>
            Import a public post
          </button>
        </div>
        <label className="block">
          <span className="text-sm font-semibold">The sentence</span>
          <textarea value={text} onChange={(event) => setText(event.target.value)} rows={5} className="field" />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Deadline, the same day named in the sentence</span>
          <input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} className="field" />
        </label>
        {mode === "IMPORTED" ? (
          <>
            <label className="block">
              <span className="text-sm font-semibold">Public page that already contains this sentence</span>
              <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://x.com/…" className="field" />
            </label>
            <p className="note">
              CalledIt fetches this page itself and checks that your sentence is really on it. If
              the page is behind a login, needs JavaScript, or does not contain the sentence
              word for word, the lock is refused and nothing is stored. Nothing here is marked
              verified until the chain has read the page.
            </p>
          </>
        ) : null}
        {!check.ok ? <p className="note note-warn" role="status">{check.message}</p> : <p className="note note-good">The sentence names its own deadline. The chain still has to accept the reading.</p>}
        {error ? <p className={phase === "failed" ? "note note-bad" : "note"} role={phase === "failed" ? "alert" : "status"}>{error}</p> : null}
        {hash ? (
          <p className="note" role="status">
            Wallet submitted <span className="break-all font-semibold">{hash}</span>. That is not a final verdict. The indexer will show the receipt after it reads the contract.
          </p>
        ) : null}
        <Phase phase={phase} />
      </form>
      <aside className="glass h-fit p-5 sm:p-7">
        <h2 className="text-3xl">Before the wallet opens</h2>
        <ul className="mt-4 space-y-3 text-sm leading-6 text-muted">
          <li>{mode === "NATIVE" ? "You are writing the forecast here." : "You are pointing at a public post."}</li>
          <li>Deadline: {deadline || "not set"}.</li>
          <li>
            {connected ? (
              <>
                Signing as <span className="break-all">{account.address}</span>
              </>
            ) : (
              "No wallet connected yet. The next step connects one."
            )}
          </li>
          <li>You cannot edit, delete, or backdate this after it locks.</li>
          <li>The server will not sign, and it is not asked for a key.</li>
          {protocol ? <li>Network: {protocol.network} (chain {protocol.chainId}).</li> : null}
        </ul>
        {wrongNetwork && protocol ? (
          <div className="note note-warn mt-4" role="alert">
            <p>
              Your wallet is on a different network, not {protocol.network}. Nothing can be locked on the
              wrong network, so the sign button stays closed until you switch.
            </p>
            <button type="button" className="btn-line mt-3 w-full" onClick={() => openChainModal?.()}>
              Switch network
            </button>
          </div>
        ) : null}
        <button type="button" disabled={!check.ok || !protocol?.contractConfigured || wrongNetwork || phase === "approval" || phase === "submitted" || phase === "accepted"} onClick={lockOnchain} className="btn-lock mt-6 w-full disabled:opacity-50">
          {signLabel}
        </button>
        {protocol?.contractAddress ? <p className="mt-3 break-all text-sm leading-6 text-muted">Contract {protocol.contractAddress}</p> : null}
        {protocol?.allowSimulator ? (
          <button type="button" disabled={!check.ok || saving} onClick={saveDraft} className="btn-line mt-3 w-full disabled:opacity-50">
            {saving ? "Saving the draft" : "Save a labeled local draft"}
          </button>
        ) : null}
        <p className="mt-3 text-sm leading-6 text-muted">A draft is a note in this app. It is not a GenLayer lock and it is left out of reputation.</p>
      </aside>
    </main>
  );
}

function Phase({ phase }: { phase: TxPhase }) {
  if (phase === "idle") return null;
  const copy: Record<TxPhase, string> = {
    idle: "",
    approval: "Your wallet should be asking you to sign. Decline it and nothing is locked.",
    submitted: "Your wallet signed it. Validators are still agreeing on the reading.",
    accepted: "GenLayer accepted the lock.",
    failed: "The lock did not go through.",
  };
  return <p className="text-sm leading-6" role="status">{copy[phase]}</p>;
}
