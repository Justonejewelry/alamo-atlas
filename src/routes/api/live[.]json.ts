import { createFileRoute } from "@tanstack/react-router";
import { loadLiveFeedCached } from "@/lib/crime/live";

function numParam(url: URL, key: string): number | undefined {
  const n = Number(url.searchParams.get(key));
  return Number.isFinite(n) ? n : undefined;
}

export const Route = createFileRoute("/api/live.json")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const feed = await loadLiveFeedCached(numParam(url, "lat"), numParam(url, "lng"));
          return Response.json(feed, {
            headers: { "cache-control": "no-store" },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return Response.json(
            { error: message, calls: [], history: [], weather: [], stale: true },
            { status: 502, headers: { "cache-control": "no-store" } },
          );
        }
      },
    },
  },
});
