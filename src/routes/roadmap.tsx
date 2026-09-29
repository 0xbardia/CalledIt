import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export const Route = createFileRoute("/roadmap")({ component: Roadmap });

const items = [
  {
    state: "Shipped",
    title: "The lock and the receipt",
    body: "One contract. Native forecasts and imported posts. A frozen reading that stays separate from your words. Evidence is submitted from the receipt, and only from the source list that was current when you locked. Profiles and a board that count the losses too.",
  },
  {
    state: "Shipped",
    title: "Studionet",
    body: "The address below is the contract this app is configured to read. If the line is empty, this build is not pointed at a deploy. The interface does not invent an address.",
  },
  {
    state: "Next",
    title: "Richer calls, same contract shape",
    body: "Clearer event types, shareable receipt cards, and a public read API that stays a mirror of the contract. A resolution can already cite one to three pages.",
  },
  {
    state: "Next",
    title: "Easier to follow",
    body: "Webhooks for indexers, and an optional display name that never replaces the wallet address on the receipt.",
  },
  {
    state: "Later",
    title: "Not in V1",
    body: "A receipt SDK, track records for agents, and any bond or appeal. There is no token in this version, and there is still no delete button. That last part is intentional.",
  },
];

function Roadmap() {
  const [address, setAddress] = useState("");
  const [network, setNetwork] = useState("");
  useEffect(() => {
    api<{ contractAddress?: string; network?: string; chainId?: number }>("/api/v1/protocol")
      .then((body) => {
        setAddress(body.contractAddress || "");
        setNetwork(body.network ? `${body.network}, chain ${body.chainId}` : "");
      })
      .catch(() => setAddress(""));
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="kicker">Roadmap</p>
      <h1 className="mt-2 text-5xl">What we build, in order</h1>
      <p className="mt-4 text-lg leading-8 text-muted">
        Shipped means you can use it. Next means it is the following slice of work. Later is research, not a promise.
      </p>
      <p className="note mt-6 break-all text-sm leading-6">
        {address ? `Contract ${address}` : "No contract address is configured in this build."}
        {network ? ` · ${network}` : ""}
      </p>
      <ol className="cascade mt-10 space-y-4">
        {items.map((item) => (
          <li key={item.title} className="glass p-5">
            <p className="text-sm font-semibold text-persimmon">{item.state}</p>
            <h2 className="mt-1 text-3xl">{item.title}</h2>
            <p className="mt-2 leading-7 text-muted">{item.body}</p>
          </li>
        ))}
      </ol>
      <p className="text-sm">
        <Link to="/docs" className="font-semibold underline">Docs</Link>
        <span className="text-muted"> · </span>
        <Link to="/security" className="font-semibold underline">Security</Link>
      </p>
    </main>
  );
}
