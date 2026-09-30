# Deployment

The contract identity, hash and Depends pin live in [CONTRACT.md](CONTRACT.md).
This file covers the process side.

## 1. Gate the source before deploying

Direct Mode and `genvm-lint` must be green on the exact file that will be
uploaded. See [TESTING.md](TESTING.md).

## 2. Deploy to hosted Studionet

Fund a Studio account, then:

```bash
node scripts/studio-certify.mjs
```

The script deploys `contracts/calledit.py` with no constructor arguments,
waits for finalization, then calls every public read method and writes
`docs/studio-evidence.json`. It does not change production configuration.

```bash
node scripts/studio-lifecycle.mjs
```

Exercises writes with the dedicated `E2E_PRIVATE_KEY` test wallet: deterministic
rejections, a real native lock, a duplicate, a real resolution, a double
resolution, and a semantic event lock. It refuses to run if the test wallet is
the contract admin.

Keys live in `.env`, which is gitignored. `ecosystem.config.cjs` reads the
runtime variables from `.env` by name, so no secret is committed, and the
production process never receives the deployer or E2E key.

## 3. Point the app at the deployed contract

Set both names, which must agree or the process refuses to start:

```
GENLAYER_CONTRACT_ADDRESS=0x…
VITE_GENLAYER_CONTRACT_ADDRESS=0x…
```

Move the previous address into `GENLAYER_ARCHIVED_CONTRACT_ADDRESSES` so old
receipts stay readable. A redeployment reuses the id space, so an author can
hold identical-looking forecasts on two addresses; the record and profile views
label the contract whenever a list spans more than one.

Production must also set `NODE_ENV=production` and `ALLOW_SIMULATOR=false`.
`APP_URL` must be `https:` in production and must appear in
`CORS_ALLOWED_ORIGINS`, or the process refuses to start.

## 4. Build and start

```bash
npm run build
pm2 delete calledit
pm2 start ecosystem.config.cjs
pm2 save
node scripts/verify-bundle.mjs
```

`npm run build` runs the Vite production build and then `db:migrate`, which
applies pending files in `migrations/` to `DATABASE_URL` inside one transaction
each and records them in `_migrations`. It is safe to re-run. The build step
inherits `.env` for `VITE_` values, so rebuild after any browser-visible
configuration change.

**The process must be restarted after every build, and `startOrReload` is not
enough.** The worker renders HTML from the bundle it loaded at start, so a
reload that leaves the process running keeps the previous build's asset
manifest while `.vercel/output` already holds the new one. The page still
answers 200, but its stylesheet and client entry 404: the site renders unstyled
and never hydrates. `delete` followed by `start` always restarts.

`node scripts/verify-bundle.mjs` is the guard. It compares the assets the
running server names against the files the build produced and exits non-zero
on drift. Run it after every restart, against localhost or the public origin:

```bash
node scripts/verify-bundle.mjs
BASE_URL=https://calledit.bydx.fun node scripts/verify-bundle.mjs
```

PM2 is configured for restart on crash and on reboot.

Local Studio, several validators in Docker, is a separate gate from hosted
Studionet. This host has no Docker, so local integration remains unverified and
a hosted run is not presented as a substitute.

## 5. Proxy

Nginx serves `calledit.bydx.fun` over TLS and proxies to `127.0.0.1:8130`,
forwarding `Host`, `X-Forwarded-For` and `X-Forwarded-Proto`. HTTP redirects to
HTTPS. Validate with `nginx -t` and only then reload.

## 6. Verify

The homepage, `/explore`, `/leaderboard`, `/forecast/<id>`, `/api/v1/protocol`
and `/api/v1/forecasts` must answer, the process must not restart in a loop,
and `pm2 logs` must show no fatal error.
