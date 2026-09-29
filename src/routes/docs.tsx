import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/docs")({ component: Docs });

const sections = [
  {
    id: "what",
    title: "What CalledIt is",
    body: "You publish a forecast before the outcome. GenLayer freezes a structured reading of that sentence. Later, a page on an allowlisted site can resolve it to correct or incorrect. The original sentence is never rewritten to match the result.",
  },
  {
    id: "agree",
    title: "How validators agree",
    body: "An unambiguous price sentence is sealed in code. Every validator computes the same reading, so there is nothing for a model to disagree about. An import or a resolution uses GenLayer’s equivalence rule: the leader proposes, the others redo the work, and they accept it only when the decision matches. Wording can differ. For a price, the printed tick can differ too, as long as both readings answer the frozen comparison the same way. The contract then checks the leader’s number against that comparison. The subject, the verdict, and whether the evidence was enough still have to match. A failed resolution leaves the forecast open.",
  },
  {
    id: "wallet",
    title: "Your wallet signs. The server does not.",
    body: "A lock is a contract write from the wallet you connected in the browser. The call is lock_native_forecast, lock_imported_forecast, or resolve_forecast. The app never asks you to paste a private key, and the API has no route that accepts one. A session signature, if you sign in, only opens a login. It does not lock a forecast and it does not spend funds.",
  },
  {
    id: "state",
    title: "What gets stored",
    body: "A successful lock is OPEN until a verdict is written once. RESOLVED cannot be overwritten. Vague forecasts, missing dates, and prompt-injection text are rejected before a model sees them. They are not saved as a special kind of failure you can later flip.",
  },
  {
    id: "time",
    title: "Whose clock",
    body: "locked_at and the deadline check use the GenLayer transaction time. Not your laptop clock, and not the clock on a news site.",
  },
  {
    id: "imports",
    title: "Imported posts",
    body: "An import has to be HTTPS, on an allowlisted host, with no IP address, no userinfo, and no fragment. A fetched page containing prompt-injection markers or control-character tricks is rejected as a whole. Otherwise, your claimed sentence must appear on the page. If it does not, the lock reverts.",
  },
  {
    id: "reads",
    title: "Reading the contract",
    body: "The source of truth is the contract. Useful views: get_forecast, get_forecast_status, get_forecast_count, get_forecast_author, get_forecast_interpretation, get_forecast_verdict, get_protocol, get_resolution_domains, get_import_domains, get_admin, get_policy_version, is_source_domain_allowed, is_import_domain_allowed, preview_url_policy, and get_author_forecast_ids. Those reads are calls. They are not signed transactions, so they do not have transaction hashes. The API under /api/v1 mirrors contract reads and reports index freshness.",
  },
  {
    id: "score",
    title: "Reputation",
    body: "Accuracy is correct divided by correct plus incorrect. Open forecasts are not misses. Drafts and simulated rows are excluded. Ambiguous and unresolved results are not scored as wins.",
  },
];

function Docs() {
  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[16rem_1fr]">
      <aside className="glass h-fit p-5 lg:sticky lg:top-28 lg:self-start">
        <p className="kicker">Docs</p>
        <h1 className="mt-2 text-4xl">How it works</h1>
        <nav className="mt-5 space-y-2 text-sm" aria-label="On this page">
          {sections.map((section) => (
            <a key={section.id} href={`#${section.id}`} className="block text-muted hover:text-ink">{section.title}</a>
          ))}
        </nav>
      </aside>
      <article className="cascade prose-page space-y-10">
        <p className="text-lg leading-8 text-muted">
          These are the rules the contract enforces. The code and the API notes sit next to them for anyone changing the product.
        </p>
        {sections.map((section) => (
          <section key={section.id} id={section.id} className="glass p-5">
            <h2 className="text-3xl">{section.title}</h2>
            <p className="mt-3 text-lg leading-8 text-muted">{section.body}</p>
          </section>
        ))}
        <p className="text-sm">
          <Link to="/security" className="font-semibold underline">Security model</Link>
          <span className="text-muted"> · </span>
          <Link to="/roadmap" className="font-semibold underline">Roadmap</Link>
        </p>
      </article>
    </main>
  );
}
