# CalledIt

**Proof you called it before it happened.**

CalledIt is a verifiable forecasting reputation protocol built on
[GenLayer](https://genlayer.com). You write a forecast, validators agree on what
it actually means, and that meaning is frozen on chain before the outcome
exists. Later, only allowlisted evidence can resolve it.

[![Direct Mode](https://img.shields.io/badge/tests-78%2F78%20Direct%20Mode-2ea44f)](docs/TESTING.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Live app](https://img.shields.io/badge/live-calledit.bydx.fun-ff5a36)](https://calledit.bydx.fun)

## What is CalledIt?

A prediction market records a bet. CalledIt records a **call**: a public claim
about the future, its agreed meaning, and eventually a verdict — kept in three
separate places so none of them can be edited after the fact.

- **Create a forecast.** Write a sentence and the deadline it names, or point at
  a public post that already contains it. Your wallet signs; the server never
  holds a key.
- **Pre-event semantic lock.** Before the outcome, validators extract the
  claim's structure: subject, predicate, comparator, threshold, direction, and
  deadline. Unambiguous price sentences are read in code, not by a model.
- **GenLayer consensus.** Interpretation and resolution run inside GenLayer
  leader/validator consensus. Validators compare *material* meaning, not wording.
- **Immutable interpretation.** The reading is sealed with the original words
  and stored separately. The two cannot be reconciled after the fact because
  they never lived in the same place.
- **Outcome resolution.** A resolver supplies up to three evidence pages. The
  contract renders them through GenLayer's web renderer, and the verdict is
  recomputed in code: a price verdict follows from the observed value and the
  locked comparator, and an event cannot resolve before its locked deadline.
- **Forecast receipts.** Every forecast gets a receipt: your words, the frozen
  reading, the criteria, the evidence, and the verdict.
- **Reputation.** Accuracy is complete-history accuracy over scored verdicts:
  `correct / (correct + incorrect)`. Open forecasts are not misses. A losing
  forecast stays on the record.

There is no token and no order book. Reputation is the only output.

![The record](docs/screenshots/record.png)

## Why GenLayer?

Locking a forecast requires agreeing on *meaning*, not on bytes. Two validators
can read the same sentence differently: one calls it an event, another a binary
outcome; one includes a price the sentence never mentioned. A deterministic
oracle cannot fix that, because the ambiguity is in the language, and a single
model's answer is one model's opinion.

So the interpretation runs under GenLayer consensus. Meaning is extracted inside
the consensus boundary, every validator independently re-runs the extraction,
and agreement is required on the fields that carry meaning. Everything that can
be decided in code is decided in code: deadlines, price arithmetic, event
direction, and source grounding. Nondeterminism is confined to the part that
genuinely needs it, and the deterministic guards are what a compromised or
mistaken model cannot move.

## Live app

**<https://calledit.bydx.fun>**

Public record, receipt pages, profiles, and the leaderboard.

![A forecast receipt](docs/screenshots/receipt.png)

## Contract

| | |
| --- | --- |
| Network | GenLayer Studionet |
| Chain ID | `61999` (`0xf22f`) |
| Contract | `0xe04f2aD4F83eFf6Bd55bc6c3979E1dB0Ee018b0E` |
| Deployment transaction | `0xfe2c012d7569b7dbdda64e947262bfb6381bd19ee758bd0c65908171b3d62717` |
| Source | [`contracts/calledit.py`](contracts/calledit.py) |
| Source SHA-256 | `d246b9505f0a2cc0003b7487c5eeae01847d7a7f70be32c9440cb0322fdef02c` |
| Depends pin | `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` |

Earlier deployments are kept in the public history so old receipts stay
readable; their evidence files are named `docs/studio-evidence-superseded-*`.
The identity table, the read-method matrix, and the verification commands are in
[docs/CONTRACT.md](docs/CONTRACT.md).

## Architecture

| Layer | Choice |
| --- | --- |
| UI | React 19, TanStack Start + TanStack Router, Tailwind CSS 4 |
| Build | Vite 8 with the Nitro server build |
| Server | Nitro (Node), REST under `/api/v1` |
| Database | PostgreSQL — index, sessions, nonces, sync state |
| Wallet | RainbowKit + wagmi + viem, browser-side signing |
| Chain client | GenLayerJS against GenLayer Studionet |
| Contract | GenLayer Intelligent Contract, `py-genlayer` runner |

The contract is canonical. The database is a query cache plus sessions, and
every view states how fresh it is. Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Forecast lifecycle

```
CREATE
  → SEMANTIC INTERPRETATION     validators extract subject, predicate,
  → CONSENSUS                   comparator, threshold, direction, deadline
  → LOCK                        original words and reading stored apart
  → OPEN
  → RESOLUTION                  allowlisted evidence rendered by GenLayer
  → FINAL VERDICT               recomputed in code, write-once
  → REPUTATION                  correct / (correct + incorrect)
```

## Security

- **Prompt-injection defenses.** Injection markers, control characters, and
  bidi/zero-width confusion are rejected before any model is consulted, and a
  whole fetched page is quarantined rather than stripped. Injected content
  cannot mint a subject, a threshold, a deadline, or a verdict.
- **Source restrictions.** Evidence must be HTTPS on an allowlisted domain, and
  the policy is snapshotted when a forecast locks, so a later admin change
  cannot rewrite history.
- **SSRF protections.** Scheme, userinfo, port, fragment, percent-encoded host,
  literal IPv4, private and link-local ranges, IPv6 and IPv4-mapped IPv6, and
  oversize URLs are all rejected in contract code.
- **Client-side wallet signing.** The browser signs through the user's wallet.
  The server holds no key, is asked for no key, and never signs.
- **Immutable forecast semantics.** Words, reading, and verdict are separate
  fields with no path to edit a resolved forecast.
- **Consensus validation.** The client never trusts its own optimism: a write
  is only reported as successful after an accepted or finalized status, a
  majority agreement, a successful leader return, and a real forecast id.

Read [docs/SECURITY_FINDINGS.md](docs/SECURITY_FINDINGS.md),
[docs/THREAT_MODEL.md](docs/THREAT_MODEL.md), and
[docs/CONSENSUS.md](docs/CONSENSUS.md).

## Testing and certification

Every number below was produced against the exact source hash above.

| Gate | Result |
| --- | --- |
| Contract Direct Mode (`genlayer-test`, no Docker, no network) | **78 passed, 0 failed, 0 skipped** |
| Contract lint, validation, typecheck (`genvm-lint`) | **passed** — 20 methods, 15 view and 5 write |
| Public contract read methods called on the deployed contract | **15 / 15** |
| Hosted Studionet lifecycle (real validators) | **9 / 9 writes finalized as expected** |
| Prompt-injection matrix, three trust boundaries plus common-mode | **passed** |
| SSRF and URL-policy suite | **passed** |
| Backend certification against PostgreSQL | **36 / 36** |
| `npm test` | **78 / 78** |
| `npm run lint`, `npm run typecheck`, `npm run build` | **clean** |
| Playwright against the live domain, Chromium and Firefox | **passed, 0 findings** |

WebKit was **not** run: the certification host lacks the GTK 4 and GStreamer
libraries WebKit needs and its package manager could not install them. That is a
host limitation, recorded in the browser verdict, and not reported as a pass.

The hosted lifecycle, transaction hashes, consensus results and final
read-back are in [docs/studio-evidence.json](docs/studio-evidence.json). How to
reproduce each gate: [docs/TESTING.md](docs/TESTING.md).

## Development

Requires Node 22 and Python 3.12 for the contract suite.

```bash
git clone https://github.com/0xbardia/CalledIt
cd CalledIt
npm ci
cp .env.example .env        # then fill in the values below
npm run dev                 # http://127.0.0.1:8080
```

The application gates:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

The contract gates:

```bash
uv venv --python 3.12 .venv-directmode
VIRTUAL_ENV=.venv-directmode uv pip install genlayer-test pytest genvm-linter
.venv-directmode/bin/python -m pytest tests/contract -q
GENVM_VERSION=v0.3.0-rc7 .venv-directmode/bin/genvm-lint check contracts/calledit.py
```

The backend certification suite needs a PostgreSQL database and applies the
migrations itself:

```bash
export DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/calledit
node scripts/migrate.mjs
npm run test:db
```

Deploying the contract to Studionet is a manual, funded operation — see
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). It is deliberately not a pull-request
check.

## Environment

Copy `.env.example` to `.env`. `.env` is gitignored and holds the database URL
and, if you deploy, the Studio deployer and test-wallet keys. The production
process receives neither key.

The contract address must be set twice, `GENLAYER_CONTRACT_ADDRESS` and
`VITE_GENLAYER_CONTRACT_ADDRESS`, and the process refuses to start if they
disagree. In production `APP_URL` must be HTTPS and must appear in
`CORS_ALLOWED_ORIGINS`.

Full reference: [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md).

## Documentation

| Document | What it covers |
| --- | --- |
| [docs/CONTRACT.md](docs/CONTRACT.md) | Contract identity, hash, pin, linter, read methods |
| [docs/CONSENSUS.md](docs/CONSENSUS.md) | Where nondeterminism sits and how agreement is decided |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Components, storage, data flow |
| [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) | Assets, adversaries, trust boundaries |
| [docs/SECURITY_FINDINGS.md](docs/SECURITY_FINDINGS.md) | Findings, evidence, status |
| [docs/API.md](docs/API.md) | HTTP endpoints and errors |
| [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) | Every environment variable |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Contract and application deployment |
| [docs/TESTING.md](docs/TESTING.md) | How to reproduce every certification gate |
| [docs/OPEN_SOURCE_CHECKLIST.md](docs/OPEN_SOURCE_CHECKLIST.md) | Publication readiness |
| [docs/PUBLICATION_AUDIT.md](docs/PUBLICATION_AUDIT.md) | What is deliberately not published |
| [docs/ROADMAP.md](docs/ROADMAP.md) | What comes after V1 |

## Roadmap

Timelocked source-list changes, per-author history, more evidence sources, and
a local multi-validator Studio gate. See [docs/ROADMAP.md](docs/ROADMAP.md).

## Contributing

Issues and pull requests are welcome. Contract changes are the sensitive path:
run Direct Mode and the linter before opening a change, and never edit a
resolved forecast's path. [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

Please report a vulnerability privately rather than in a public issue.
See [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
