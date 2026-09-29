# Architecture

```text
wallet (RainbowKit / injected)
    → genlayer-js writeContract
        → GenLayer Studionet
            → CalledIt contract  (canonical)

browser
    → /api/v1
        → indexer + sessions + reputation
            → Postgres-compatible database
```

The application is one TanStack Start build. Production serves its generated server function and static assets through `srvx` under PM2, with Nginx handling HTTPS and reverse proxying. The versioned API, migrations, sessions, and indexer run in that same application server.

## Canonical state

Only the contract can lock a forecast or write a verdict. The database stores:

- indexed forecasts copied from reads
- transaction hashes the indexer has seen
- sign-in nonces and sessions
- local drafts when the simulator is explicitly enabled

Draft ids start at 1000001. Their `chain_status` is `simulated` and `lock_state` is `draft`. Reputation ignores them.

## Indexing

`POST /api/v1/indexer/sync` reads `get_forecast_count` and each `get_forecast` through genlayer-js when `GENLAYER_CONTRACT_ADDRESS` is set. Background refresh runs at most once every five minutes and backs off after an RPC error. Rows are upserted by `(network, contract_address, forecast_id)`. The chain status written by this path is `accepted`. The server does not call a read "finalized".

When the active contract changes, earlier addresses are listed in `GENLAYER_ARCHIVED_CONTRACT_ADDRESSES`. Their indexed rows remain in shared profiles and reputation. Forecast URLs include the contract address so repeated ids remain distinct. Archived receipts are read-only in the app.

`POST /api/v1/indexer/transactions` checks a submitted hash against the configured GenLayer RPC. It verifies the destination contract, sender, lock method, and stored forecast text, then records the RPC-reported transaction state. A client-supplied status is ignored. Periodic contract reads remain canonical for indexed forecast state.

## Time

Deadline checks and `locked_at` use the GenLayer transaction clock. The API does not ask a website what time it is.

## Admin

`add_resolution_domain` and `add_import_domain` require the deploying admin. Each forecast stores the resolution-domain list at lock time. Later additions do not rewrite that snapshot.
