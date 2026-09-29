# Publication audit

Review date: 2026-09-29, immediately before the V1 publication to
`github.com/0xbardia/CalledIt`. This file records what was deliberately left out
of the public tree and why, so a reviewer does not have to guess whether a
missing file was an accident.

## What the public repository contains

The product and everything needed to rebuild, verify, and run it:

| Area | Path |
| --- | --- |
| Intelligent contract | `contracts/calledit.py`, plus the archived `contracts/deployed-<address>.py` |
| Frontend and server | `src/`, `server/`, `public/` |
| Database | `migrations/`, `migrations/auth/` |
| Tests | `tests/contract/`, `tests/e2e/`, `src/**/*.test.ts` |
| Tooling | `scripts/`, `vite.config.ts`, `eslint.config.mjs`, `tsconfig.json`, `ecosystem.config.cjs` |
| Documentation | `docs/`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `LICENSE` |
| Certification evidence | `docs/studio-evidence.json` and the `docs/studio-evidence-superseded-*.json` history |

## What is deliberately not published

| Path | Why |
| --- | --- |
| `.env` | Real deployment configuration. Gitignored, and it holds the database URL plus the Studio deployer and E2E keys. |
| `.grok/` | Authoring-workspace scaffolding from the environment this project was built in: skill notes, reference documents, a preview log and pid, and a build-flag file. `scripts/with-app-env.mjs` treats a missing `app-env.json` as "no overrides", and `npm run build` was verified to pass with the directory removed. |
| `AGENTS.md` | The same authoring workspace's agent instructions. Not project documentation. |
| `attachments/` | The original build brief as a prompt transcript. It is not product documentation and reads as an instruction sheet rather than a spec. |
| `startup.sh` | Sandbox-only: it starts a dev server from the authoring workspace and is not how the app is deployed. `docs/DEPLOYMENT.md` is the real procedure. |
| `node_modules/`, `.vercel/`, `.tanstack/`, `artifacts/`, `.pytest_cache/`, `__pycache__/`, `.venv-directmode/` | Dependencies, build output, caches, and the local Direct Mode virtual environment. All reproducible. |
| `screenshots/` | 33 MB of QA captures. A small, current, curated set is published under `docs/screenshots/` instead. |

## Publication gates that were checked

- `detect-secrets` over the source tree: no secret. Every candidate was triaged
  by hand — the SSRF userinfo fixture, a transaction hash, a source hash, and a
  pytest cache tag.
- No 32-byte private key anywhere in the tree. The only `"0x…"` 64-hex values
  are `"tx":` fields in the Studio evidence files.
- Eight `scripts/*.test.mjs` tests read the excluded workspace files listed
  above. They skip themselves when those files are absent, so a fresh clone runs
  the suite with zero failures instead of eight red tests. In the authoring
  workspace the same suite passes all 195.
- `src/` and `server/` contain no private key, no account construction, and no
  transaction signing. The only two places that read a key are
  `scripts/studio-certify.mjs` and `scripts/studio-lifecycle.mjs`, and neither
  is imported by the application.
- The canonical V1 contract is `0xe04f2aD4F83eFf6Bd55bc6c3979E1dB0Ee018b0E`.
  Every other address in the tree is either in the superseded evidence files or
  explicitly listed in `GENLAYER_ARCHIVED_CONTRACT_ADDRESSES` in
  `docs/DEPLOYMENT.md`.

## Outstanding before a wider release

`docs/SECURITY_FINDINGS.md` F-001: the preview OAuth broker credential that was
once embedded in source has been removed, and the production build does not
contain it. Rotating the credential on the broker itself is an action outside
this repository and had **not** been performed at publication time. Nothing in
this tree claims otherwise.
