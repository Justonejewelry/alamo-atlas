/** Dev/preview JSON feed so the service worker can poll with the tab closed. */
export function atlasApiPlugin() {
  return {
    name: "alamo-atlas-live-api",
    configureServer(server) {
      server.middlewares.use(apiMiddleware(server));
    },
  };
}

function apiMiddleware(server) {
  return async function atlasLiveApi(req, res, next) {
    const url = new URL(req.url ?? "/", "http://local");
    const path = url.pathname;
    if (path === "/api/camera") {
      try {
        const mod = await server.ssrLoadModule("/src/lib/crime/transguide.ts");
        const jpeg = await mod.snapshotJpeg(url.searchParams.get("id") || "");
        if (!jpeg) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.statusCode = 200;
        res.setHeader("content-type", "image/jpeg");
        res.setHeader("cache-control", "public, max-age=15");
        res.end(Buffer.from(jpeg));
      } catch {
        res.statusCode = 502;
        res.end();
      }
      return;
    }
    if (path === "/api/daily.json") {
      try {
        const mod = await server.ssrLoadModule("/src/lib/crime/daily.ts");
        const load = mod.loadDailyDispatch;
        if (typeof load !== "function") throw new Error("loadDailyDispatch missing");
        const feed = await load();
        res.statusCode = 200;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.setHeader("cache-control", "no-store");
        res.end(JSON.stringify(feed));
      } catch (err) {
        res.statusCode = 502;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.end(
          JSON.stringify({
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
            error: String(err?.message ?? err),
          }),
        );
      }
      return;
    }
    if (path !== "/api/live.json") {
      next();
      return;
    }
    try {
      const mod = await server.ssrLoadModule("/src/lib/crime/live.ts");
      const load = mod.loadLiveFeedCached ?? mod.loadLiveFeed;
      if (typeof load !== "function") throw new Error("loadLiveFeed missing");
      const lat = Number(url.searchParams.get("lat"));
      const lng = Number(url.searchParams.get("lng"));
      const feed = await load(
        Number.isFinite(lat) ? lat : undefined,
        Number.isFinite(lng) ? lng : undefined,
      );
      const body = JSON.stringify(feed);
      res.statusCode = 200;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      res.end(body);
    } catch (err) {
      res.statusCode = 502;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: String(err?.message ?? err), calls: [], history: [], weather: [] }));
    }
  };
}
