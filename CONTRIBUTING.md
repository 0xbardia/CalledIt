# Contributing

## Setup

1. Use Node 22 and Python 3.12.
2. `npm ci --legacy-peer-deps` — RainbowKit 2.2.8 declares a `wagmi@^2` peer
   range while the project runs wagmi 3.7.7, so npm's peer re-resolution has to
   be skipped to install the lockfile as committed.
3. `cp .env.example .env` and set `APP_URL` and any database settings.
4. Install `genlayer-test` and `genvm-linter` into a Python 3.12 environment if you will touch the contract.
   The Direct Mode suite downloads the GenVM runner bundle on first use. Recent
   GenVM releases publish it as `genvm-runners-all.tar.xz`, while
   `genlayer-test` 0.29.2 still asks for the older `genvm-universal.tar.xz`
   name. If the download 404s, seed the cache once:

   ```bash
   mkdir -p ~/.cache/gltest-direct
   curl --fail --location -o ~/.cache/gltest-direct/genvm-universal-v0.3.0-rc7.tar.xz \
     https://github.com/genlayerlabs/genvm/releases/download/v0.3.0-rc7/genvm-runners-all.tar.xz
   ```

   CI does this for you.

## Changing the contract

- Keep the Depends comment as the first line, then a blank line.
- Do not add an edit or delete method for locked forecasts.
- Do not strict-compare raw model text or raw pages.
- Run the whole Direct Mode suite and the linter before opening a pull request:
  `python -m pytest tests/contract -q` and
  `genvm-lint check contracts/calledit.py`. Both are wired into CI.
- If the source you deploy differs from the source you tested, the deployment is
  not certified. `docs/CONTRACT.md` records the hash the deployed contract must
  match, and CI checks the committed source against it.

## Changing the app

- Wallet writes stay in the browser.
- Do not read `E2E_PRIVATE_KEY` from server code.
- Do not label indexer data `finalized` unless something in the server observed finality.
- Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`.

## Reviews

Prefer a smaller change that keeps the security checks over a shorter function that drops one. Comments should explain a constraint (consensus, Studio parser, reputation formula), not narrate the next line.
