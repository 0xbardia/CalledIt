# Security findings

Review date: 2026-09-29, Final V1 certification run. Scope: the reviewed
contract and its archived predecessor, URL and evidence policy, consensus, API,
database and indexer, wallet path, deployment configuration, and source
publication. Findings fixed during this run are listed as well as the ones that
remain.

## Fixed in this run

### F-014 — Narrow injection patterns missed common phrasings

- Severity: Medium
- Component: `contracts/calledit.py`, `_INJECTION`
- Description: The marker scan did not cover "act as system", "always return
  CORRECT", "change the target threshold to …", "override … policy", "mark
  correct" without a pronoun, or a claimed "trusted authority" notice. These
  strings reached the model.
- Impact: A wider injection surface for the model, and a false sense that the
  guard was exhaustive. No state corruption was reachable: the grounding,
  price-arithmetic, source-grounding and deadline rules are independent of the
  marker list.
- Evidence: The certification payload matrix was expanded to 20 forecast, 10
  imported-page and 10 evidence payloads, including every family named in the
  release checklist. Before the fix, `act_as_system`, `always_correct`,
  `change_deadline`, `change_threshold`, `override_rules` and
  `trusted_authority` were not refused at the forecast boundary. After the fix
  all 40 are refused before consensus, and `tests/contract` passes 78/78.
- Remediation: Extended the pattern. The architectural control remains the
  deterministic grounding rules, not the pattern list.
- Status: Fixed in the contract deployed at
  `0xe04f2aD4F83eFf6Bd55bc6c3979E1dB0Ee018b0E`.

### F-015 — A source export was not covered by the deployment lint run

- Severity: Low
- Component: `eslint.config.mjs`, `.gitignore`
- Description: The Direct Mode toolchain installs a Python virtual environment
  beside the app. ESLint walked it and reported 4785 errors from vendored
  JavaScript, so the lint gate could not be used as a release signal.
- Impact: The lint gate became unusable, and a real regression could hide inside
  the noise.
- Evidence: `npm run lint` exited 1 with 5163 problems, all inside
  `.venv-directmode/lib/.../pyright/dist/`.
- Remediation: Ignore `.venv*/` in the ESLint config and `.gitignore`.
- Status: Fixed. `npm run lint` exits 0 with no error and no warning.

### F-016 — The public record could show indistinguishable rows

- Severity: Low
- Component: `src/routes/explore.tsx`, `src/routes/profile/$address.tsx`
- Description: A redeployment restarts the id space on a new address. Because
  archived contracts stay in the history scope, one author can hold two
  forecasts with the same id, subject, author and date, and the list showed
  both with no way to tell them apart. The detail link carried the contract, so
  only the list was ambiguous.
- Impact: A reader could not tell which contract a row came from, and one
  author's history could look like a duplicate prediction.
- Evidence: After the redeployment the record listed five rows, including two
  identical-looking "The SEC will approve a spot SOL ETF" entries and two
  identical-looking BTC entries.
- Remediation: Show the contract on each row whenever the list spans more than
  one address. The active contract keeps a single clean list.
- Status: Fixed and verified in the browser at 320–1920 px.

## Open findings

### F-001 — Shared live-preview OAuth secret was present in source

- Severity: High
- Component: `src/lib/auth/preview.ts`
- Description: The sandbox OAuth client secret was a literal in the source tree
  and was used as a fallback. The fallback is gone; federated preview sign-in
  now requires an injected secret.
- Impact: A party holding the credential could use the broker's preview-client
  flow inside its configured preview callback boundary.
- Evidence: `detect-secrets` flagged the declaration as high entropy. An
  in-memory scan of the production artifact did not find it. There is no Git
  history in this workspace, so past commits cannot be audited.
- Remediation: Rotate the broker credential upstream and inject the
  replacement before publishing. The broker is outside this workspace.
- Status: Mitigated in this source tree. The upstream rotation is not something
  this repository can perform, so it remains open and is disclosed here.

### F-002 — Renderer DNS and redirect destination are outside the contract

- Severity: Medium
- Component: `gl.nondet.web.render`
- Description: The contract validates the initial HTTPS URL, rejects literal
  IPs and enforces an allowlist, but it cannot inspect the renderer's DNS
  answer or where a redirect lands.
- Impact: An allowlisted host or a redirect could reach an unintended address if
  the hosted renderer does not enforce public-address resolution.
- Evidence: Direct Mode and the hosted reads verify the initial URL rules. No
  supported interface exposes renderer DNS or redirect handling to the contract.
- Remediation: Confirm and document the renderer's DNS and redirect policy.
  Do not move judgment web access to ordinary backend HTTP.
- Status: External residual. No exploit observed.

### F-007 — One admin can extend the source list

- Severity: Medium
- Component: `add_resolution_domain`, `add_import_domain`
- Description: Only the deploying address can add a domain. Historical
  forecasts keep the policy snapshot frozen at lock time.
- Impact: A compromised admin can allow a domain for future locks.
- Evidence: Direct Mode covers unauthorized admin access and unchanged
  snapshots; the hosted reads confirm the active admin and policy version.
- Remediation: Keep the key offline. A timelock is possible in a later release;
  old snapshots stay immutable.
- Status: Accepted residual, disclosed on `/security`.

### F-008 — Pattern matching cannot stop novel common-mode prompts

- Severity: Medium
- Component: forecast, import and evidence parsing
- Description: No string list enumerates every injection phrasing, and all
  validators could share one model failure.
- Impact: Novel wording could influence a candidate reading.
- Evidence: The common-mode tests force leader and validator onto the same
  attacker-chosen reading, assert the validator still votes `True`, and assert
  the write is still refused by deterministic code: injected subject →
  `UNGROUNDED_SUBJECT`, lowered target → `VERDICT_MISMATCH`, false event verdict
  → `VERDICT_MISMATCH`, unverified page → `SOURCE_NOT_VERIFIED`, injected page →
  `INSUFFICIENT_EVIDENCE`. Hosted Studionet refused a live injection
  (`0x8b81a513bab43a901201ea358f9e43b096e4cd4c1e2730a80889e2f118639f5c`,
  rollback `INJECTION`).
- Remediation: Keep the protocol invariants independent of model output.
- Status: Mitigated. Language that survives deterministic grounding remains a
  residual risk.

### F-010 — Rate limits are process-local

- Severity: Low
- Component: `src/server/http.ts`
- Description: In-memory counters reset on restart and do not coordinate
  across instances.
- Impact: Aggregate limits can be bypassed if the service scales out.
- Evidence: The deployment is a single PM2 process; auth nonces are separately
  single-use in Postgres.
- Remediation: Move limits to a shared store if the service grows.
- Status: Accepted for V1.

### F-011 — WalletConnect is not configured

- Severity: Low
- Component: frontend wallet UI
- Description: No WalletConnect project id is set; RainbowKit offers the
  injected-wallet path.
- Impact: Mobile deep-link connect is unavailable.
- Evidence: `VITE_WALLETCONNECT_PROJECT_ID` is empty in production; no invented
  id is used.
- Remediation: Configure a real project before advertising this path.
- Status: Accepted.

### F-012 — The chain read mirror is not a finality gadget

- Severity: Low
- Component: indexer and UI
- Description: Indexed rows mirror current contract state. Transaction receipts
  may report `accepted` or `finalized`; the index is not an independent
  finality guarantee.
- Impact: A reorg could briefly change a mirrored row.
- Evidence: `noteTransaction` only accepts an RPC-reported state, and the
  certification tests prove chain status never regresses once finalized.
- Remediation: Keep the contract canonical and expose index freshness, which
  the UI already does.
- Status: Accepted and labeled.

### F-009 — The development simulator can label drafts under an address

- Severity: Low
- Component: `POST /api/v1/simulator/forecasts`
- Description: With the simulator on and no session, the body can name an
  address.
- Impact: A fake draft could appear under that address. Drafts are labeled and
  excluded from reputation.
- Evidence: Production sets `ALLOW_SIMULATOR=false`, and the production build
  reads `allowSimulator: false` from `/api/v1/protocol`.
- Remediation: Keep the simulator off in production.
- Status: Accepted for local development.

## Earlier findings, still fixed

- **F-003** (Medium) event interpretation metadata split equivalent readings —
  normalized; the hosted event lock finalized with `MAJORITY_AGREE`.
- **F-004** (High) a negative event could resolve before its deadline — now
  `INSUFFICIENT_EVIDENCE` before the deadline in either direction.
- **F-005** (High) client transaction status was trusted — the API now verifies
  the transaction against the RPC and stores only the RPC state.
- **F-006** (High) majority disagreement could look like success in the client —
  the write result requires an accepted or finalized status, `MAJORITY_AGREE`,
  a successful leader return and a valid forecast id.
- **F-013** (Medium) active-contract links were case-sensitive — normalized; the
  active and archived ids now resolve.

## Secret and wallet audit

`detect-secrets` 1.5.0 over `src server scripts contracts tests docs public
migrations` plus the root manifests: no secret. Every hit was triaged by hand —
the SSRF test payload `https://user:pass@…`, a transaction hash, a source hash,
and a pytest cache tag. The 64-hex sweep found only `"tx":` fields.

The production artifact was scanned the same way: the only hits are vendored
library code. The real values of `DATABASE_URL`, `E2E_PRIVATE_KEY` and
`GENLAYER_DEPLOYER_PRIVATE_KEY` are absent from `.vercel/output`.

The wallet path is client-side only. `src/` and `server/` contain no private
key, no account construction and no transaction signing; the only two places
that read a key are the Studio maintenance scripts, which are not imported by
the application. `ecosystem.config.cjs` passes neither key to the process.

## Prompt injection and URL evidence

The three trust boundaries are tested independently: 20 forecast payloads, 10
imported-page payloads and 10 resolution-evidence payloads, each refused
before a state write. The URL policy matrix covers scheme, userinfo, port,
fragment, percent-encoded host, oversized URL, literal IPv4, private IPv4,
link-local IPv4, `::1`, link-local IPv6, IPv4-mapped IPv6, octal-style host,
localhost and `.local`/`.internal` suffixes, a suffix-confusion host, and an
unlisted domain. Contract evidence retrieval uses `gl.nondet.web.render` for
adjudication; the backend never fetches a page to decide a verdict.
