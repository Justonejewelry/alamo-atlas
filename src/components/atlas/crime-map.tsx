import { memo, useEffect, useState, type ComponentType } from "react";
import type { FeatureCollection } from "geojson";
import type { LiveCall } from "@/lib/crime/live";
import type { Geography, Metric, ZipStat } from "@/lib/crime/types";

export type MapSelection = { kind: "zip"; id: string } | { kind: "area"; id: string } | null;

export type CrimeMapProps = {
  zipGeo: FeatureCollection | null;
  areaGeo: FeatureCollection | null;
  zips: ZipStat[];
  areas: { name: string; n: number }[];
  geography: Geography;
  metric: Metric;
  selected: MapSelection;
  onSelect: (sel: MapSelection) => void;
  user: { lat: number; lng: number } | null;
  homeZip: string | null;
  watchZips: string[];
  liveCalls: LiveCall[];
  selectedCallId: string | null;
  onSelectCall: (call: LiveCall) => void;
  focus: { lat: number; lng: number; zoom?: number } | null;
  showHeat: boolean;
  showLive: boolean;
  onHoverZip?: (zip: string | null) => void;
};

export const CrimeMap = memo(function CrimeMap(props: CrimeMapProps) {
  const [Inner, setInner] = useState<ComponentType<CrimeMapProps> | null>(null);

  useEffect(() => {
    let live = true;
    import("./crime-map-inner")
      .then((mod) => {
        if (live) setInner(() => mod.CrimeMapInner);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  if (!Inner) {
    return <div className="absolute inset-0 bg-bg" aria-hidden="true" />;
  }
  return <Inner {...props} />;
});
