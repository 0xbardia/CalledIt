# Open source checklist

- [x] MIT license
- [x] README with setup, trust boundaries and test commands
- [x] CONTRIBUTING and SECURITY disclosure notes
- [x] `.env` is gitignored; `.env.example` lists variable names only
- [x] No private key, account construction or transaction signing in `src/` or `server/`
- [x] `E2E_PRIVATE_KEY` and `GENLAYER_DEPLOYER_PRIVATE_KEY` are read only by the Studio maintenance scripts, which the application never imports
- [x] `ecosystem.config.cjs` reads runtime variables from `.env` by name, so no secret is committed and neither key reaches the process
- [x] Contract source, Direct Mode tests and security findings are in the tree
- [x] CI workflow exists for typecheck, app tests and a production build
- [x] `detect-secrets` 1.5.0 over the source tree and the built artifact: no secret, every hit triaged
- [x] The real values of `DATABASE_URL`, `E2E_PRIVATE_KEY` and `GENLAYER_DEPLOYER_PRIVATE_KEY` are absent from `.vercel/output`
- [x] Contract identity, deployment transaction, source hash and Depends pin are recorded in `docs/CONTRACT.md`
- [ ] Contract Direct Mode in CI needs a Python 3.12 runner with `genlayer-test`. The workflow documents the command; it does not provision a private runner.
- [ ] Hosted Studionet deployment is manual. It is not a pull-request check.
- [ ] Rotate the formerly source-embedded preview OAuth broker credential and provision the replacement through a secret store before publishing. The source fallback was removed; the broker is external to this workspace. Tracked as F-001.
- [ ] Git history cannot be scanned because this workspace has no `.git` metadata. Scan the real repository history before publishing.

The Direct Mode toolchain is a local virtual environment, `.venv-directmode`,
created from `uv` and gitignored. Recreate it with the commands in
`docs/TESTING.md`; nothing else in the tree depends on it.
