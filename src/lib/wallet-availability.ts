import { useEffect, useState } from "react";

/**
 * Wallet availability, as the page can honestly observe it.
 *
 * An injected wallet publishes `window.ethereum`. WalletConnect is not offered —
 * no project id is configured — so with no injected provider there is no way for
 * this site to connect, and saying so before the user clicks is kinder than a
 * modal that waits for an extension that will never answer.
 *
 * The first paint is always "checking": extensions inject after the document
 * starts loading, so an immediate check would report a wallet that is merely
 * still arriving.
 */
export type WalletPresence = "checking" | "present" | "absent";

export function useWalletPresence(): WalletPresence {
  const [state, setState] = useState<WalletPresence>("checking");
  useEffect(() => {
    const settle = () => {
      setState((window as { ethereum?: unknown }).ethereum ? "present" : "absent");
    };
    // Long enough for a normal extension, short enough not to nag.
    const timer = setTimeout(settle, 600);
    window.addEventListener("ethereum#initialized", settle);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("ethereum#initialized", settle);
    };
  }, []);
  return state;
}

export type ConnectProblem = "install-a-wallet" | "unlock-your-wallet";

/**
 * The reason the connect button cannot work, or null.
 *
 * Only reported after the user has actually tried to connect, so a visitor
 * reading the record is never told about a problem they have not hit.
 */
export function useConnectProblem(): ConnectProblem | null {
  const presence = useWalletPresence();
  const [attempted, setAttempted] = useState(false);
  useEffect(() => {
    const mark = () => setAttempted(true);
    window.addEventListener("click", mark, { once: true, capture: true });
    window.addEventListener("keydown", mark, { once: true, capture: true });
    return () => {
      window.removeEventListener("click", mark, { capture: true });
      window.removeEventListener("keydown", mark, { capture: true });
    };
  }, []);
  if (!attempted) return null;
  if (presence === "absent") return "install-a-wallet";
  return null;
}
