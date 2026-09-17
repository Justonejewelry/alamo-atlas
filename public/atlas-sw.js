/* Alamo Atlas background alerts. Polls /api/live.json when no tab is open. */
const STORE = "alamo-atlas-sw";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STORE);
      if (data.type === "watch") {
        await cache.put("/watch", new Response(JSON.stringify(data.watch || [])));
        await cache.put("/follow", new Response(JSON.stringify(data.follow || [])));
      }
      if (data.type === "notify" && data.title) {
        await self.registration.showNotification(data.title, {
          body: data.body || "",
          icon: "/logo.jpg",
          badge: "/logo.jpg",
          tag: data.tag || "atlas",
          data: { url: "/" },
        });
      }
    })(),
  );
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "atlas-live") event.waitUntil(poll());
});

self.addEventListener("sync", (event) => {
  if (event.tag === "atlas-live") event.waitUntil(poll());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if ("focus" in w) return w.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});

async function poll() {
  try {
    const res = await fetch("/api/live.json", { cache: "no-store" });
    if (!res.ok) return;
    const feed = await res.json();
    const cache = await caches.open(STORE);
    const watchRes = await cache.match("/watch");
    const followRes = await cache.match("/follow");
    const seenRes = await cache.match("/seen");
    const watch = watchRes ? await watchRes.json() : [];
    const follow = followRes ? await followRes.json() : [];
    const seen = new Set(seenRes ? await seenRes.json() : []);
    const zips = new Set(watch.map((w) => w.zip).filter(Boolean));
    const streets = watch.map((w) => String(w.street || w.address || "").toLowerCase()).filter((s) => s.length > 4);
    const highs = (feed.calls || []).filter((c) => {
      if (c.severity !== "high") return false;
      if (zips.has(c.zip)) return true;
      const st = String(c.street || "").toLowerCase();
      return streets.some((s) => st.includes(s.slice(0, 18)));
    });
    const fresh = highs.filter((c) => !seen.has(c.id));
    for (const c of fresh.slice(0, 3)) {
      await self.registration.showNotification(c.problem, {
        body: [c.address, c.zip].filter(Boolean).join(" · "),
        icon: "/logo.jpg",
        tag: c.id,
        data: { url: `/?zip=${c.zip || ""}` },
      });
      seen.add(c.id);
    }
    const liveIds = new Set((feed.calls || []).map((c) => c.id));
    const byId = new Map((feed.calls || []).map((c) => [c.id, c]));
    for (const f of follow) {
      if (f.kind !== "call" || f.status === "cleared") continue;
      const c = byId.get(f.id);
      if (!c) {
        const tag = `cleared:${f.id}`;
        if (!seen.has(tag)) {
          await self.registration.showNotification(f.title || "Call", {
            body: `Off the live board · ${f.subtitle || ""}`.trim(),
            icon: "/logo.jpg",
            tag,
            data: { url: "/" },
          });
          seen.add(tag);
        }
        continue;
      }
      const fp = [c.problem, c.address, c.zip, c.units || "", c.tac || "", (c.txdot && c.txdot.summary) || "", (c.camera && c.camera.name) || ""].join("|");
      if (f.fingerprint && fp !== f.fingerprint) {
        const tag = `upd:${f.id}:${fp.slice(0, 24)}`;
        if (!seen.has(tag)) {
          await self.registration.showNotification(c.problem, {
            body: [c.address, c.zip, c.txdot && c.txdot.summary].filter(Boolean).join(" · "),
            icon: "/logo.jpg",
            tag,
            data: { url: `/?zip=${c.zip || ""}` },
          });
          seen.add(tag);
        }
      }
    }
    void liveIds;
    await cache.put("/seen", new Response(JSON.stringify([...seen].slice(-400))));
  } catch {
    /* board down — skip */
  }
}
