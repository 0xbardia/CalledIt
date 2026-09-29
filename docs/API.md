# API

Base path: `/api/v1`. JSON errors use `{ "error": { "code", "message" } }`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Process is up |
| GET | `/ready` | Database reachable, plus indexer state |
| GET | `/protocol` | Public network, chain id, contract address, simulator flag |
| GET | `/forecasts` | Indexed forecasts. `?status=OPEN\|RESOLVED`, `?drafts=1`, `?limit=1..50`, `?cursor=<id>:<contract-address>`. The response includes a composite `nextCursor` and indexer freshness. Bad filters return 400. |
| GET | `/forecasts/:id` | One forecast. `?contract=<address>` selects an archived deployment when ids overlap; without it, the active contract takes precedence. |
| GET | `/profiles/:address` | Forecasts and stats |
| GET | `/profiles/:address/stats` | Reputation only |
| GET | `/leaderboard` | Accuracy ranking. Drafts excluded |
| GET | `/activity` | Recent indexed rows |
| GET | `/session` | Current session address or null |
| POST | `/auth/nonce` | Body `{ address }`. Returns a 10-minute single-use message |
| POST | `/auth/verify` | Body `{ address, nonce, signature }`. Sets an HttpOnly cookie |
| POST | `/auth/logout` | Deletes the session |
| POST | `/indexer/sync` | Pull contract reads. No-op reason if no contract is configured |
| POST | `/indexer/transactions` | Body `{ hash, forecastId }`. Checks the RPC transaction destination, author, lock call, and forecast text before attaching its RPC-reported state |
| POST | `/simulator/forecasts` | Dev-only labeled draft. 403 when the simulator is off |

There is no route that accepts a private key.

## Reputation

`accuracy = correct / (correct + incorrect)` over locked, non-simulated rows whose verdict is `CORRECT` or `INCORRECT`. Open forecasts, unresolved results, and drafts are not in the denominator. `null` accuracy means nothing has been scored.

## Sessions

The nonce is consumed in one conditional update after the signature matches, so a replay or a double submit cannot open two sessions. Cookies are `HttpOnly` and `SameSite=Lax`. `Secure` is set when the app URL is https. The session is bound to the request origin. Transaction attachment reads the transaction from the configured RPC, ignores any client-supplied status, and accepts only a hash for the locked forecast's author, contract, lock method, and text. Resolution transactions cannot replace the lock transaction.
