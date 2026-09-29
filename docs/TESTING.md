# Testing

Every command below was run on the reviewed source recorded in
[CONTRACT.md](CONTRACT.md). A gate that could not be run is reported as not run,
never as a pass.

## Contract, Direct Mode

```bash
uv venv --python 3.12 .venv-directmode
VIRTUAL_ENV=.venv-directmode uv pip install genlayer-test pytest genvm-linter
.venv-directmode/bin/python -m pytest tests/contract -q
```

Python 3.12, `genlayer-test` 0.29.2, `genvm-linter` 0.11.0. No Docker, no
network: `mock_web` and `mock_llm`.

| File | Covers |
| --- | --- |
| `test_calledit_direct.py` | deployment, native and imported locks, semantic interpretation, vague and mismatched deadlines, duplicates (text, wording, semantics), contradictory calls, control characters, grounding, URL policy matrix, resolution, early negative, insufficient/conflicting/injected evidence, price arithmetic, admin policy history, event directions, validator agreement and disagreement, read stability |
| `test_calledit_injection_matrix.py` | 20 forecast payloads, 10 imported-page payloads and 10 evidence payloads, each refused at the boundary; four common-mode cases where consensus is forced to agree and the write is still refused; every public read method called; out-of-range and malformed read arguments |

Direct Mode, whole suite: **78 passed, 0 failed, 0 skipped**.

## Contract linter

```bash
GENVM_VERSION=v0.3.0-rc7 .venv-directmode/bin/genvm-lint check contracts/calledit.py
GENVM_VERSION=v0.3.0-rc7 .venv-directmode/bin/genvm-lint schema contracts/calledit.py
GENVM_VERSION=v0.3.0-rc7 .venv-directmode/bin/genvm-lint typecheck contracts/calledit.py
```

Lint 3/3 checks passed, validation passed, 20 methods (15 view, 5 write),
typecheck reported no errors. The linter notes a newer `py-genlayer` runner
exists; the pin is not bumped without re-auditing it, and `GENVM_VERSION` must
name a cached GenVM that contains the pinned SDK.

## Application

```bash
npm test          # 78 passed, 0 failed
npm run lint      # 0 errors, 0 warnings
npm run typecheck # tsc --noEmit clean
npm run build     # vite build + db:migrate
npm run test:db   # 36 passed against the configured database
```

`npm test` covers chain-result finality, malformed auth input, pagination,
reputation, forecast preflight, and the platform script invariants.

In a published checkout, eight of the `scripts/*.test.mjs` tests are **skipped**,
not failed. They assert against the authoring workspace's own files — its skill
notes, its agent instructions, and the build-flag file that the Vite wrapper
treats as optional. That workspace is not part of the public repository; see
[PUBLICATION_AUDIT.md](PUBLICATION_AUDIT.md). Every product assertion still
runs, and the same suite passes all 195 with the workspace present.

`npm run test:db` needs `DATABASE_URL`; it runs the same SQL production runs
against the configured database and cleans up after itself.

| File | Covers |
| --- | --- |
| `auth.certification.test.ts` | nonce randomness, valid signature, single use, replay, expiry, wrong wallet, wrong origin, cross-origin session rejection, session expiry, logout, forged cookie, malformed address |
| `indexer.certification.test.ts` | normal catch-up, duplicate event, restart, open-row refresh, write-once verdict, chain-status regression, RPC timeout, RPC rate limit, malformed response, wrong network, wrong contract, gap handling, recovery, transaction idempotence, foreign-contract isolation, cursor integrity |
| `reputation.certification.test.ts` | empty history, open-only, hand-computed mixed history, all-loss, all-win, drafts and simulated rows, verified imports, duplicate reads, ambiguous verdicts, unknown category, and that a UI status filter cannot change the score |

## Hosted Studionet

```bash
node scripts/studio-certify.mjs
node scripts/studio-lifecycle.mjs
```

Not mocks. `docs/studio-evidence.json` records the source hash, address,
deployment transaction, 20 reads, 9 writes with their transaction hashes,
consensus results, and the final read-back.

## Browser

```bash
node tests/e2e/certification.mjs
```

Drives the live production domain in Chromium and Firefox: every route at 320,
390, 768, 1280 and 1920 px, plus the states a user can reach — empty profile,
loading, success, validation error, API 5xx, GenLayer RPC error, no wallet, and
a finalized transaction receipt. It records console errors, page errors, failed
requests, asset 404s, API 5xx, horizontal overflow, and the accessibility
checks a keyboard user depends on. The verdict and screenshots are written to
`screenshots/certification/`.

WebKit is not runnable on this host: it needs GTK 4 and GStreamer system
libraries that the package manager cannot install here. That is an environment
limitation and is recorded in the verdict, not counted as a pass.
