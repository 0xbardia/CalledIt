const CODES: Record<string, string> = {
  DUPLICATE: "You already locked this exact sentence for this deadline.",
  SOURCE_NOT_VERIFIED: "That page does not contain the sentence, so the import was not locked.",
  SOURCE_NOT_ALLOWED: "That site is not on the import list.",
  NOT_RESOLVABLE: "The sentence is not an objective call, so it was not locked.",
  UNGROUNDED_SUBJECT: "The reading named something that is not in your sentence.",
  UNGROUNDED_TARGET: "The reading used a number that is not in your sentence.",
  UNGROUNDED_COMPARATOR: "The reading used a direction your sentence does not state.",
  DEADLINE_MISMATCH: "The deadline does not match the date written in the sentence.",
  DEADLINE_PAST: "That deadline is too soon. It has to be at least an hour out.",
  AMBIGUOUS_DEADLINE: "The sentence has to name its own calendar date.",
  INJECTION: "That text tries to override the protocol, so it was refused.",
  ALREADY_RESOLVED: "This forecast already has a verdict. It cannot be written again.",
  INSUFFICIENT_EVIDENCE: "Those pages did not prove the call. The forecast stays open.",
  EARLY_NEGATIVE: "An incorrect call cannot be recorded before the deadline. The forecast stays open.",
  VERDICT_MISMATCH: "The verdict did not match the price on the page. Nothing was written.",
  CONFLICTING_EVIDENCE: "The pages disagree. Nothing was written, and the forecast stays open.",
  EVIDENCE_NOT_ALLOWED: "One of those pages is not on the source list frozen at lock.",
  EVIDENCE_COUNT: "Submit one to three evidence pages.",
  NOT_FOUND: "That forecast is not on this contract.",
};

const CLIENT: [RegExp, string][] = [
  [
    /ChainMismatch|chain mismatch|Unsupported chain|wrong network|network mismatch|SwitchChainError/i,
    "Your wallet is on the wrong network, so nothing was sent and nothing was locked. Switch it to the network named above, then try again.",
  ],
  [
    /Transaction (could not be found|reverted|failed)|could not be found/i,
    "Your wallet sent the transaction, but it never appeared on the network. Nothing was locked. Check that your wallet is on the GenLayer network, then try again.",
  ],
  [
    /user (rejected|denied)|rejected the request/i,
    "You declined in your wallet, so nothing was sent and nothing was locked.",
  ],
  [/ChainDisconnected|TransportNotFound|HttpRequestError|fetch failed|network ?error|Load failed/i,
    "The connection to the network dropped before the answer came back. Nothing was locked. Check your connection and try again."],
  [/timeout|timed out/i,
    "The network did not answer in time. Nothing was locked. Try again in a moment."],
  [/insufficient funds/i,
    "That wallet does not have enough funds for this transaction. Nothing was locked."],
];

/**
 * Wallet and RPC failures arrive as library strings — "Transaction could not be
 * found. Version: viem@2.56.9" tells a reader nothing about what to do next.
 * Return a sentence they can act on, and keep the raw text out of the page.
 */
function explainClientError(message: string): string {
  for (const [pattern, text] of CLIENT) {
    if (pattern.test(message)) return text;
  }
  // Never show a raw library string: it names packages and versions, not causes.
  if (/version:|viem@|genlayer-js|undefined \(reading|\bat \w+\./i.test(message)) {
    return "The wallet step failed and the reason was not readable. Nothing was locked. Try again, and if it keeps happening the network may be down.";
  }
  return message;
}

/** Turn a contract or client error into a sentence a person can act on. */
export function explainChainError(message: string): string {
  if (/Timed out waiting for transaction/i.test(message)) {
    return "Your wallet already submitted this. Validators are still agreeing, so it was not rejected. The record will catch up when they finish.";
  }
  if (/WEBPAGE_LOAD_FAILED|UNDETERMINED|MAJORITY_DISAGREE|NondetException/i.test(message)) {
    return "Those pages could not be read as a single decision. The forecast stays open.";
  }
  for (const [code, text] of Object.entries(CODES)) {
    if (message.includes(code)) return text;
  }
  return explainClientError(message);
}
