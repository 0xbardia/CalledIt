# Contributing

## Setup

1. Use Node 22 and Python 3.12.
2. `npm install`
3. `cp .env.example .env` and set `APP_URL` and any database settings.
4. Install `genlayer-test` and `genvm-linter` into a Python 3.12 environment if you will touch the contract.

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
