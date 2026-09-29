import type { Forecast } from "@/lib/api";
import { shortAddress, when } from "@/lib/api";

export function Receipt({ forecast, example = false }: { forecast: Forecast; example?: boolean }) {
  const locked = forecast.lock_state === "locked";
  return (
    <article className="stamp glass text-ink" aria-label={example ? "Example receipt" : `Forecast ${forecast.forecast_id}`}>
      <header className="flex items-start justify-between gap-4 border-b border-dashed border-white/15 px-5 py-4">
        <div>
          <p className="text-sm text-muted">{example ? "Example, not a live forecast" : locked ? "CalledIt receipt" : "Local draft, not locked"}</p>
          <h2 className="mt-1 font-display text-3xl">#{String(forecast.forecast_id).padStart(5, "0")}</h2>
        </div>
        <StatusPill status={forecast.status} verdict={forecast.verdict} draft={!locked} />
      </header>
      <div className="space-y-4 px-5 py-5">
        <p className="font-display text-2xl leading-snug">{forecast.subject || forecast.original_text}</p>
        {forecast.comparator ? (
          <p className="text-lg tabular-nums">
            {forecast.comparator} {forecast.target_value} {forecast.unit}
            <span className="text-muted"> before {forecast.deadline_iso}</span>
          </p>
        ) : (
          <p className="text-muted">Deadline {forecast.deadline_iso}</p>
        )}
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Row label="Author" value={shortAddress(forecast.author)} />
          <Row label="Mode" value={forecast.mode === "IMPORTED" ? "Imported source" : "Written here"} />
          <Row label="Source check" value={sourceLabel(forecast.source_verification)} />
          <Row label="Locked" value={locked ? when(forecast.locked_at) : "Not locked"} />
        </dl>
      </div>
    </article>
  );
}

function sourceLabel(value: string): string {
  if (value === "NOT_APPLICABLE") return "Not required";
  if (value === "VERIFIED") return "Sentence was on the page";
  if (value === "UNVERIFIED") return "Not checked";
  return value || "Not recorded";
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-0.5 font-semibold">{value}</dd>
    </div>
  );
}

export function StatusPill({ status, verdict, draft = false }: { status: string; verdict: string; draft?: boolean }) {
  const label = draft ? "Draft" : verdict || status;
  const tone = draft ? "pill-draft" : verdict === "CORRECT" ? "pill-yes" : verdict === "INCORRECT" ? "pill-no" : "pill-open";
  const seal = !draft && (verdict === "CORRECT" || verdict === "INCORRECT") ? " seal" : "";
  return <span className={`pill ${tone}${seal}`}>{label}</span>;
}
