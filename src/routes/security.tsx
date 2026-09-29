import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/security")({ component: Security });

const points = [
  ["Prompt injection", "Instruction-like forecast text is rejected before any model runs. A fetched page containing instruction markers or control-character tricks is rejected as a whole before consensus; its text is not passed as evidence."],
  ["Source policy", "Resolution URLs must be HTTPS and on the forecast’s frozen domain snapshot. The contract rejects all literal IPs, userinfo, and fragments. GenLayer controls DNS resolution and redirects after the initial URL is accepted."],
  ["Equivalence", "Imports and resolutions use a custom equivalence rule. Validators may use different words. They may not disagree on whether the page contained the sentence, on the verdict, or on whether the evidence was enough. A live price may print two different integers. They still have to agree whether the frozen comparison holds."],
  ["No server keys", "Contract writes are signed in the browser wallet. The API has no endpoint that accepts a private key, and it will not attach a transaction that was sent to a different contract or that locks a different sentence."],
  ["Write-once verdicts", "A failed resolution leaves the forecast open. An event that has not happened before its deadline cannot be marked absent early. A recorded verdict cannot be overwritten."],
  ["Reputation", "Accuracy is correct divided by correct plus incorrect. Open calls, drafts, and unscored results are not treated as misses."],
];

function Security() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="kicker">Security</p>
      <h1 className="mt-2 text-5xl">What the chain refuses to trust</h1>
      <p className="mt-4 text-lg leading-8 text-muted">
        When a sentence is already unambiguous, every validator runs the same code. When it is not, they redo the work and accept the leader only if the decision matches. You sign writes in the connected wallet. The server is an index.
      </p>
      <ol className="mt-8 space-y-8">
        {points.map(([title, body]) => (
          <li key={title} className="glass p-5">
            <h2 className="text-3xl">{title}</h2>
            <p className="mt-2 text-lg leading-8 text-muted">{body}</p>
          </li>
        ))}
      </ol>
    </main>
  );
}
