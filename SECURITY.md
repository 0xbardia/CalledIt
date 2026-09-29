# Security

CalledIt locks public forecasts. Do not send secrets in a forecast. Everything locked is world-readable.

## Report a vulnerability

Open a private security advisory on this repository. Include:

- the component (contract, API, web)
- the impact
- a proof that does not include live credentials

Please give us time to fix the issue before publishing it. Do not file a public
issue for an unfixed vulnerability.

## What we want to hear about

- A way to change a locked forecast, author, deadline, or verdict
- A way to make insufficient evidence resolve as correct or incorrect
- SSRF or prompt injection that commits attacker-controlled semantics
- A way for the server to sign a user transaction
- Authentication replay, session fixation, or SQL injection

## Out of scope

- The single admin key that can add future source domains. Old forecasts keep their snapshot. This is documented centralization, not a silent bug.
- Missing WalletConnect project id. Injected wallets still work.
- Draft rows created while `ALLOW_SIMULATOR=true`. They are labeled and excluded from reputation.

The findings log is [docs/SECURITY_FINDINGS.md](docs/SECURITY_FINDINGS.md). The threat model is [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).
