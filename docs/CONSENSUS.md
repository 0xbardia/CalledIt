# Consensus

Interpretation and resolution are nondeterministic. They run inside
`gl.vm.run_nondet_unsafe`, which is the generic form of GenLayer's equivalence
principle: the leader proposes, every validator independently re-runs the same
function and votes. The contract supplies its own validator because material
meaning here is structured, not prose.

`gl.eq_principle.strict_eq` is deliberately **not** used. It compares
`spawn_sandbox(fn) == leader_result`, so a page that renders a live price, or a
model that words the same claim differently, would split the validators and the
lock would never finalize. `prompt_comparative` is also not used: it would add
a second, nondeterministic comparison on top of one that is already decidable
in code. Deterministic comparison of material fields is strictly stronger than
a model judging model output, and it is cheaper.

## Where each nondeterministic step sits

| Path | Nondeterminism | Equivalence mechanism | Comparison rule | Storage written only after |
| --- | --- | --- | --- | --- |
| Semantic lock, native | `gl.nondet.exec_prompt` (CALLEDIT_INTERPRET_V1) | `gl.vm.run_nondet_unsafe` with a custom validator | material fields: resolvable, ambiguity, category class, comparator, target, unit, occurrence, deadline match, casefolded subject, exact predicate | deterministic grounding: subject and predicate must be verbatim spans of the locked text, target/comparator/unit grounded, deadline sealed in code, schema complete |
| Semantic lock, imported | `gl.nondet.web.render` + `exec_prompt` | same, plus a `verified` flag computed in code | material fields, and `verified` must match | the claim must literally appear on the rendered page; `verified` is never model output |
| Resolution | `gl.nondet.web.render` + `exec_prompt` (CALLEDIT_RESOLVE_V1) | same | verdict, sufficiency, conflict, observed happened, and — for prices — the comparison outcome rather than the tick | price arithmetic, event direction, deadline and early-negative rules |
| URL / source policy | none | not applicable | deterministic in contract code | scheme, host shape, IP literal, userinfo, port, fragment, encoding, length, allowlist |

The validator re-runs the entire leader function, so each validator sees its own
render and its own model output. Agreement on material meaning is required
before the leader's result is returned; if the validators disagree the VM
terminates and the write never happens.

## Deterministic rules that do not depend on any model

- Injection markers, control characters and bidi/zero-width confusion are
  rejected before the model is consulted. A whole fetched page is quarantined
  rather than stripped, so mixed evidence never reaches the model.
- Deadlines are parsed, horizon-checked and sealed in code. A model cannot move
  a deadline or claim a match it does not have.
- A price verdict is recomputed from the observed value and the locked
  comparator. A model that says `CORRECT` for a print below the threshold
  reverts with `VERDICT_MISMATCH`.
- An event is not resolved before its locked deadline, in either direction.
  Absence before the deadline is insufficient, not incorrect.
- Source verification is a substring test against the rendered page. A model
  cannot mark a page verified.
- Storage is write-once. Every guard runs before the first assignment, so a
  revert leaves the previous verdict untouched.

## Common-mode containment

If every validator shares one model failure, agreement is reached on the wrong
answer. The defense is that the write is then refused by code, not by
divergence. `tests/contract/test_calledit_injection_matrix.py` forces leader and
validator onto the same attacker-chosen reading, asserts the validator still
votes `True`, and asserts the write still reverts:

| Attack | Consensus result | Deterministic guard |
| --- | --- | --- |
| Injected subject, all validators agree | agreement | `UNGROUNDED_SUBJECT` |
| Model lowers the target and calls it CORRECT | agreement | `VERDICT_MISMATCH` |
| Model calls a negative event CORRECT | agreement | `VERDICT_MISMATCH` |
| Model claims an unverified page | agreement on the refusal | `SOURCE_NOT_VERIFIED` |
| Injected page, no model call | no consensus | whole-page quarantine → `INSUFFICIENT_EVIDENCE` |

## Certification modes

These are reported separately and never merged.

- **Direct Mode** — `genlayer-test` with `mock_web` and `mock_llm`. No Docker,
  no network.
- **Local Studio** — several local validators in Docker. Not run in this
  workspace; the host has no Docker.
- **Hosted Studionet** — real validators. `docs/studio-evidence.json` records
  the deployment, the read results, and every write with its transaction hash,
  consensus result and finalization status.
