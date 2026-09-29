import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, connectorsForWallets, darkTheme } from "@rainbow-me/rainbowkit";
import { injectedWallet } from "@rainbow-me/rainbowkit/wallets";
import { WagmiProvider, createConfig, http } from "wagmi";
import { useState, type ReactNode } from "react";
import { studionet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";
import "@rainbow-me/rainbowkit/styles.css";

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined;
const chainId = Number(import.meta.env.VITE_GENLAYER_CHAIN_ID || 61999);
const network = import.meta.env.VITE_GENLAYER_NETWORK || "studionet";
const chains = { studionet, "testnet-asimov": testnetAsimov, "testnet-bradbury": testnetBradbury };
const active = chains[network as keyof typeof chains];
if (!active || active.id !== chainId) throw new Error("CalledIt GenLayer network and chain id do not match.");

const connectors = connectorsForWallets(
  [{ groupName: "Browser wallet", wallets: [injectedWallet] }],
  { appName: "CalledIt", projectId: projectId && projectId.length > 8 ? projectId : "calledit-injected-only" },
);

const wagmi = createConfig({
  connectors,
  chains: [active],
  transports: { [active.id]: http(active.rpcUrls.default.http[0]) },
  ssr: true,
});

export function Providers({ children }: { children: ReactNode }) {
  const [query] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 20_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );
  return (
    <WagmiProvider config={wagmi}>
      <QueryClientProvider client={query}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#ff5a36",
            accentColorForeground: "#1a0c08",
            borderRadius: "large",
            fontStack: "system",
          })}
        >{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
