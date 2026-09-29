import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { Providers } from "@/components/providers";
import { Frame } from "@/components/frame";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "CalledIt" },
      { name: "description", content: "Proof you called it before it happened." },
      { name: "theme-color", content: "#07090e" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__app/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__app/icon-180.png" },
    ],
  }),
  component: Root,
  notFoundComponent: NotFound,
});

function Root() {
  return (
    <html lang="en" className="antialiased">
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <Providers>
            <Frame>
              <Outlet />
            </Frame>
          </Providers>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}

function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-5 py-24">
      <p className="kicker">404</p>
      <h1 className="mt-3 text-5xl text-ink">That page is not on the record.</h1>
      <p className="mt-4 text-lg text-muted">The forecast, profile, or note you asked for is not here.</p>
      <a href="/" className="btn-lock mt-8">Back to the front page</a>
    </main>
  );
}
