import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Mark, Wordmark } from "@/components/logo";

const desk = [
  ["Record", "/explore"],
  ["Board", "/leaderboard"],
  ["Desk", "/app"],
  ["Docs", "/docs"],
] as const;

const extra = [
  ["Roadmap", "/roadmap"],
  ["Security", "/security"],
] as const;

export function Frame({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    setOpen(false);
  }, [path]);

  return (
    <div className="app-shell">
      <div className="liquid" aria-hidden="true">
        <span className="orb orb-a" />
        <span className="orb orb-b" />
        <span className="orb orb-c" />
      </div>
      <div className="grain" aria-hidden="true" />
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="mast">
        <div className="mast-bar">
          <Link to="/" className="wordmark">
            <Mark />
            <Wordmark />
          </Link>
          <nav className="desk-nav" aria-label="Primary">
            {desk.map(([label, href]) => (
              <Link key={href} to={href} className="nav-link">{label}</Link>
            ))}
          </nav>
          <div className="mast-actions">
            <div className="hidden lg:block">
              <WalletSlot />
            </div>
            <Link to="/forecast/new" className="btn-lock">
              <span className="sm:hidden">Lock</span>
              <span className="hidden sm:inline">Lock a forecast</span>
            </Link>
            <button
              type="button"
              className="menu-btn lg:hidden"
              aria-expanded={open}
              aria-controls="mobile-nav"
              onClick={() => setOpen((value) => !value)}
            >
              <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
              <span className="relative grid size-5 place-items-center">
                <Menu className={`col-start-1 row-start-1 size-5 transition duration-300 ${open ? "scale-[0.25] opacity-0 blur-sm" : "scale-100 opacity-100 blur-none"}`} />
                <X className={`col-start-1 row-start-1 size-5 transition duration-300 ${open ? "scale-100 opacity-100 blur-none" : "scale-[0.25] opacity-0 blur-sm"}`} />
              </span>
            </button>
          </div>
        </div>
        <div className={`mobile-wrap lg:hidden ${open ? "is-open" : ""}`}>
          <div className="mobile-clip">
            <nav id="mobile-nav" className="mobile-panel" aria-label="Mobile">
              <div className="mb-2">
                <WalletSlot />
              </div>
              {[...desk, ...extra].map(([label, href]) => (
                <Link key={href} to={href}>{label}</Link>
              ))}
            </nav>
          </div>
        </div>
      </header>
      <div id="content" key={path} className="page-enter relative z-10">{children}</div>
      <footer className="site-footer relative z-10">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:px-8 md:grid-cols-3">
          <div>
            <p className="wordmark text-2xl"><Mark /><Wordmark /></p>
            <p className="mt-3 max-w-xs text-sm leading-6 text-muted">
              A public forecast stays the way you wrote it. Your wallet signs the lock. This site never holds the key.
            </p>
          </div>
          <div className="text-sm leading-8">
            <p className="font-semibold">Read</p>
            <Link className="block text-muted hover:text-ink" to="/explore">Record</Link>
            <Link className="block text-muted hover:text-ink" to="/leaderboard">Board</Link>
            <Link className="block text-muted hover:text-ink" to="/docs">Docs</Link>
          </div>
          <div className="text-sm leading-8">
            <p className="font-semibold">The project</p>
            <Link className="block text-muted hover:text-ink" to="/roadmap">Roadmap</Link>
            <Link className="block text-muted hover:text-ink" to="/security">Security</Link>
            <Link className="block text-muted hover:text-ink" to="/forecast/new">Lock a forecast</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function WalletSlot() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return <span className="btn-ghost">Connect</span>;
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        if (!mounted || !account) {
          return (
            <button type="button" onClick={openConnectModal} className="btn-ghost">
              Connect
            </button>
          );
        }
        if (chain?.unsupported) {
          return (
            <button type="button" onClick={openChainModal} className="btn-ghost text-persimmon-deep">
              Wrong network
            </button>
          );
        }
        return (
          <button type="button" onClick={openAccountModal} className="btn-ghost max-w-40 truncate">
            {account.displayName}
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
