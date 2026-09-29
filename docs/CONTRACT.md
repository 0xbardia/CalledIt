# Contract identity

The single source of truth for the reviewed contract is this file. The address,
the deployment transaction and the source hash must all be changed together;
if they ever disagree, the contract is not certified.

| Field | Value |
| --- | --- |
| Network | Studionet |
| RPC | `https://studio.genlayer.com/api` |
| Chain id | `61999` (`0xf22f`) |
| Contract | `0xe04f2aD4F83eFf6Bd55bc6c3979E1dB0Ee018b0E` |
| Deployment transaction | `0xfe2c012d7569b7dbdda64e947262bfb6381bd19ee758bd0c65908171b3d62717` |
| Deployment status | `FINALIZED`, `MAJORITY_AGREE` |
| Source file | `contracts/calledit.py` |
| Source SHA-256 | `d246b9505f0a2cc0003b7487c5eeae01847d7a7f70be32c9440cb0322fdef02c` |
| Depends pin | `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` |
| Methods | 20 total — 15 view, 5 write |

Verify the hash before any deployment or certification claim:

```bash
sha256sum contracts/calledit.py
```

`scripts/studio-certify.mjs` hashes the same file it uploads, and writes the
address, deployment transaction and every public read into
`docs/studio-evidence.json`. The evidence file is regenerated on every run, so
its `sourceSha256` must equal the hash above.

## Static certification

```bash
GENVM_VERSION=v0.3.0-rc7 .venv-directmode/bin/genvm-lint check contracts/calledit.py
GENVM_VERSION=v0.3.0-rc7 .venv-directmode/bin/genvm-lint schema contracts/calledit.py
GENVM_VERSION=v0.3.0-rc7 .venv-directmode/bin/genvm-lint typecheck contracts/calledit.py
```

`GENVM_VERSION` matters: the linter otherwise picks the newest cached GenVM,
whose `py-genlayer` SDK does not contain the pinned runner.

## Direct Mode

```bash
.venv-directmode/bin/python -m pytest tests/contract -q
```

Python 3.12 with `genlayer-test` 0.29.2 and `genvm-linter` 0.11.0. No Docker, no
network: `mock_web` and `mock_llm` only. `tests/contract/test_calledit_direct.py`
covers the protocol rules; `tests/contract/test_calledit_injection_matrix.py`
covers the adversarial payload families at all three trust boundaries, the
common-mode containment cases, and every public read method.

## Hosted Studionet

```bash
node scripts/studio-certify.mjs    # deploy the exact file, exercise every read
node scripts/studio-lifecycle.mjs  # writes, reverts, resolution, final state
```

`studio-lifecycle.mjs` refuses to run if `E2E_PRIVATE_KEY` is the contract
admin. Deployer and test keys live in `.env`, which is gitignored, and never
reach the built artifact.

## Public read methods

Every method is called against the deployed contract, not the source. Results
are in `docs/studio-evidence.json` (`reads`, `idReads`, `finalReads`).

| Method | Pre-lock | Post-lock | After resolution |
| --- | --- | --- | --- |
| `get_protocol` | answered | — | — |
| `get_forecast_count` | 0 | 1 | 1 |
| `get_resolution_domains` | answered | — | — |
| `get_import_domains` | answered | — | — |
| `get_admin` | answered | — | — |
| `get_policy_version` | 1 | — | — |
| `is_source_domain_allowed` | true / false | — | — |
| `is_import_domain_allowed` | true / false | — | — |
| `preview_url_policy` | allow, scheme, IP, userinfo | — | — |
| `get_author_forecast_ids` | `[]` | `[1]` | `[1]` |
| `get_forecast` | `NOT_FOUND` | full row | resolved row |
| `get_forecast_status` | `NOT_FOUND` | `OPEN` | `RESOLVED` |
| `get_forecast_author` | `NOT_FOUND` | test wallet | test wallet |
| `get_forecast_interpretation` | `NOT_FOUND` | sealed reading | sealed reading |
| `get_forecast_verdict` | `NOT_FOUND` | empty verdict | `CORRECT` |

## Retiring a contract

When the reviewed source changes, the old address must be kept in
`GENLAYER_ARCHIVED_CONTRACT_ADDRESSES` so old receipts stay readable, and the
new address set in both `GENLAYER_CONTRACT_ADDRESS` and
`VITE_GENLAYER_CONTRACT_ADDRESS`. A redeployment reuses the id space, so the
same author can hold identical-looking forecasts on two addresses; the record
and profile views label the contract whenever the list spans more than one.

## Contract history

Everything below is historical. The canonical V1 contract is the one at the top
of this file.

| Address | Status |
| --- | --- |
| `0x862AD984ef8a9A6aa45e5b8C29B5AD89E45B9Dc6` | Archived. Its source is kept at `contracts/deployed-862AD984ef8a9A6aa45e5b8C29B5AD89E45B9Dc6.py`. |
| `0x964ebDC39Ece62989Efe54D1b6eB06BEE02bFE9b` | Archived. Superseded by the V1 deployment. |

Their deployment records are in `docs/superseded-studio-evidence-*.json` and
`docs/studio-evidence-superseded-*.json`.
