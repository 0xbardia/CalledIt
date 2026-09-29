# Roadmap

Status words mean what they say. Planned work is not live.

## SHIPPED — R0 / R1

- One CalledIt contract with native and imported locks
- Structured interpretation, frozen separately from the original sentence
- Resolution rules, including no early negative
- Receipts, profiles, explore, leaderboard
- Accuracy = correct / (correct + incorrect)
- Source allowlist with a per-forecast snapshot
- Wallet-signed writes, server sessions, indexer
- Direct Mode tests and a hosted Studionet deployment when `docs/studio-evidence.json` says `deployed: true`

## IN PROGRESS

- Broader browser coverage of the signing path against the deployed contract. The automated harness cannot click a user's wallet approval.

## PLANNED — R1.1

- More event types with the same grounding rules
- Multi-source resolution that still fails closed on conflict
- Embed cards
- A stable public read API that stays a mirror of the contract

## PLANNED — R1.2

- Clearer import flow for public posts
- Webhooks for external indexers
- Optional names that never replace the wallet address

## RESEARCH — R2 / R3

- Receipt SDK
- Agent track records
- Bonds, challenges, appeals

V1 has no token and no custodial wallet. Research items are not implemented.
