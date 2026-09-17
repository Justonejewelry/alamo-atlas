import { useCallback, useState } from "react";

export type GeoState =
  | { status: "idle" }
  | { status: "asking" }
  | { status: "ready"; lat: number; lng: number }
  | { status: "denied" }
  | { status: "error"; message: string };

export function useGeo() {
  const [geo, setGeo] = useState<GeoState>({ status: "idle" });

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeo({ status: "error", message: "Location is not available in this browser." });
      return;
    }
    setGeo({ status: "asking" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ status: "ready", lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setGeo({ status: "denied" });
        else setGeo({ status: "error", message: err.message || "Could not read location." });
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  }, []);

  const clear = useCallback(() => setGeo({ status: "idle" }), []);

  return { geo, request, clear };
}
