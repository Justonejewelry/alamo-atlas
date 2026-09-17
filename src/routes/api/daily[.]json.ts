import { createFileRoute } from "@tanstack/react-router";
import { loadDailyDispatch } from "@/lib/crime/daily";

export const Route = createFileRoute("/api/daily.json")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const feed = await loadDailyDispatch();
          return Response.json(feed, {
            headers: { "cache-control": "no-store" },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return Response.json(
            {
              day: "",
              requestedDay: "",
              label: "",
              lagged: false,
              fetchedAt: new Date().toISOString(),
              source: "",
              total: 0,
              calls: [],
              byProblem: [],
              byZip: [],
              police: 0,
              fire: 0,
              ems: 0,
              error: message,
            },
            { status: 502, headers: { "cache-control": "no-store" } },
          );
        }
      },
    },
  },
});
