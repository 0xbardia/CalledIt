# Threat model

## Assets

- Frozen forecast text and interpretation
- Verdicts and the reputation derived from them
- The source-policy snapshot stored with each forecast
- Session cookies

## Actors

- A user with a wallet
- A malicious forecast author
- A malicious web page fetched as import or evidence
- The contract admin
- The application operator, who must not have user keys

## Trust

| Component | Trusted for |
| --- | --- |
| GenLayer consensus | Agreeing on a nondeterministic result that already passed deterministic checks |
| Contract code | State machine, URL policy, grounding, write-once verdicts |
| Admin address | Adding domains for future forecasts only |
| API | Indexing and sessions. Not verdicts |
| Browser wallet | Signing the user's own writes |

## Attacks we explicitly handle

- Rewriting a call after the fact. No edit or delete method exists.
- Backdating. `locked_at` comes from the transaction.
- Hiding losses. Reputation uses the full indexed history. The UI has no hide-loss control.
- Caller-supplied URL access to literal IPv4/IPv6 addresses (including private, link-local, loopback, and IPv4-mapped literals), HTTP, userinfo, fragments, over-long URLs, and non-allowlisted hosts. Rejected before render.
- Prompt injection in the user string. Rejected before the model.
- Prompt injection or control/bidi confusion in a rendered page. The whole page is quarantined before consensus; flagged content cannot verify a claim or resolve a forecast.
- A model that returns a price verdict inconsistent with the observed number. Reverts.
- Resolving incorrect before the deadline. Reverts, forecast stays open.
- A second resolution. Reverts.
- Client-supplied "finalized" transaction status. The API stores pending.

## Attacks we do not pretend to solve

- Every validator believing a novel jailbreak that survives quarantine and still grounds to the user's actual sentence. Field grounding limits the damage. It is not a formal proof against all language attacks.
- A compromised admin adding a bad domain for forecasts locked after the change.
- A user who signs a transaction they did not read.
- DNS rebinding or a redirect from an allowed hostname to a private destination inside GenLayer's web renderer. The contract validates the initial URL but cannot inspect renderer DNS resolution or redirect policy. This is an external runtime boundary and needs confirmation from the renderer operator.
- A shared preview OAuth credential remains embedded in `src/lib/auth/preview.ts` for the App Builder's live-preview broker. It is not shipped in the production build or passed to PM2, but it is present in the source tree and must be rotated/externalized before publishing the source repository.
