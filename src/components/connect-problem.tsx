import {
  useConnectProblem,
  useWalletPresence,
  type ConnectProblem,
} from "@/lib/wallet-availability";

const GUIDANCE: Record<ConnectProblem, React.ReactNode> = {
  "install-a-wallet": (
    <>
      No browser wallet was found on this device, so nothing here can sign yet.{" "}
      <a
        className="underline"
        href="https://learn.rainbow.me/understanding-web3"
        target="_blank"
        rel="noreferrer"
      >
        Install a browser wallet
      </a>{" "}
      and reload this page. Everything else on this site works without one.
    </>
  ),
  "unlock-your-wallet": (
    <>
      Your wallet is installed but locked. Unlock it and press Connect again — this
      page cannot see an account until you do.
    </>
  ),
};

/**
 * A plain-language reason the connect button will not work, or nothing.
 *
 * Lives in the page rather than behind a modal: without it, someone with no
 * wallet extension presses "Browser wallet" and waits forever for an extension
 * that is not installed.
 */
export function ConnectProblemNote() {
  const presence = useWalletPresence();
  const problem = useConnectProblem();
  if (!problem) return null;
  // A wallet that arrived after the first look wins.
  if (presence === "present" && problem === "install-a-wallet") return null;
  return (
    <p className="note note-warn" role="status">
      {GUIDANCE[problem]}
    </p>
  );
}
