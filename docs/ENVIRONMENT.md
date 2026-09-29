# Environment

Copy `.env.example` to `.env`. `.env` is gitignored. Never commit it.

| Key | Required | Notes |
| --- | --- | --- |
| `NODE_ENV` | yes | `production` refuses `ALLOW_SIMULATOR=true` |
| `APP_URL` | yes | Public origin used in cookies and sign-in messages |
| `PORT` | no | Local preview uses 8080. The current production PM2 process listens on 8130 behind Nginx |
| `DATABASE_URL` | no | Empty uses the built-in Postgres-compatible database |
| `CORS_ALLOWED_ORIGINS` | no | Comma-separated |
| `GENLAYER_NETWORK` | no | Default `studionet` |
| `GENLAYER_CHAIN_ID` | no | `61999` for Studionet |
| `GENLAYER_RPC_URL` | no | `https://studio.genlayer.com/api` |
| `GENLAYER_CONTRACT_ADDRESS` | no | Full deployed address. Empty only before a real deploy |
| `GENLAYER_ARCHIVED_CONTRACT_ADDRESSES` | no | Comma-separated earlier contracts whose indexed rows stay in profiles, activity, and reputation |
| `VITE_GENLAYER_*` | no | Public browser values; runtime rejects mismatched network, chain id, RPC, or contract values |
| `VITE_WALLETCONNECT_PROJECT_ID` | no | Empty means injected wallet only. Do not invent a project id |
| `LOG_LEVEL` | no | `info` |
| `ALLOW_SIMULATOR` | no | `true` only in development |
| `PLAYWRIGHT_BASE_URL` | no | Test harness |
| `E2E_PRIVATE_KEY` | no | Dedicated test wallet for Studio writes. Never passed to the production process or committed |
| `GENLAYER_DEPLOYER_PRIVATE_KEY` | no | Studio deployment script only. Never passed to the production process or committed |

The API creates random session tokens and stores only their SHA-256 hashes. Browser code only receives `VITE_` values. PM2 receives an explicit allowlist of runtime settings, not either private key.

CalledIt authenticates with a wallet signature: the server issues a random
nonce, the browser signs it, and the server stores only the SHA-256 hash of the
resulting session token. No signing secret is configured, because none is used.
The optional live-preview federated-auth scaffold, when that environment feature
is enabled, reads its own `*_AUTH_ISSUER`, `*_AUTH_CLIENT_ID` and
`*_AUTH_CLIENT_SECRET` variables. CalledIt's production wallet-session API does
not use that scaffold, PM2 does not pass those keys to this process, and no
broker credential is stored in the source tree — sandbox federated sign-in
requires an injected secret.
