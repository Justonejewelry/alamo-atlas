import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { QueryProvider } from "@/components/query-provider";
import appCss from "../styles.css?url";

const APP_NAME = "Alamo Atlas";

function publicShareHost(): string {
  const raw =
    (typeof import.meta !== "undefined" ? String(import.meta.env?.VITE_PUBLIC_HOSTNAME ?? "") : "") ||
    (typeof process !== "undefined" ? String(process.env?.VITE_PUBLIC_HOSTNAME ?? "") : "");
  const host = raw.trim().replace(/^https?:\/\//, "").split("/")[0]?.toLowerCase() ?? "";
  if (!host || !/^[a-z0-9.-]+$/.test(host) || !host.includes(".")) return "";
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return "";
  if (host === "vercel.app" || host.endsWith(".vercel.app") || host === "vercel.com" || host.endsWith(".vercel.com")) {
    return "";
  }
  return host;
}

export const Route = createRootRoute({
  head: () => {
    const host = publicShareHost();
    const xBanner = host ? `https://${host}/x-banner.jpg` : "";
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
        { title: APP_NAME },
        {
          name: "description",
          content:
            "Live SAPD dispatch pins, neighborhood crime reports, and calls-for-service vs written offenses for San Antonio — from public city and county data.",
        },
        { name: "theme-color", content: "#0a0b0c" },
        ...(xBanner ? [{ property: "x:game:image", content: xBanner }] : []),
      ],
      links: [
        { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=Instrument+Serif:ital@0;1&display=swap",
        },
        { rel: "stylesheet", href: appCss },
        { rel: "manifest", href: "/__grok/manifest.webmanifest" },
        { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      ],
    };
  },
  component: () => (
    <html lang="en" suppressHydrationWarning className="antialiased">
      <head>
        <HeadContent />
      </head>
      <body className="bg-bg text-fg overflow-hidden">
        <PreviewHostBridge />
        <AuthProvider>
          <QueryProvider>
            <Outlet />
          </QueryProvider>
        </AuthProvider>
        <Toaster
          theme="dark"
          position="top-center"
          offset={16}
          toastOptions={{
            classNames: {
              toast: "!bg-surface !text-fg !border-border",
              title: "!text-fg",
              description: "!text-muted",
            },
          }}
        />
        <Scripts />
      </body>
    </html>
  ),
});
