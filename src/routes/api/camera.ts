import { createFileRoute } from "@tanstack/react-router";
import { snapshotJpeg } from "@/lib/crime/transguide";

export const Route = createFileRoute("/api/camera")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = new URL(request.url).searchParams.get("id") ?? "";
        try {
          const jpeg = await snapshotJpeg(id);
          if (!jpeg) return new Response(null, { status: 404 });
          return new Response(Buffer.from(jpeg), {
            headers: {
              "content-type": "image/jpeg",
              "cache-control": "public, max-age=15",
            },
          });
        } catch {
          return new Response(null, { status: 502 });
        }
      },
    },
  },
});
