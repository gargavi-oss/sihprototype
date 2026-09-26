"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Marker,
  Popup,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { DEPTS } from "@/lib/format";
import { blockState, pointAlong } from "@/lib/mapModel";

/* ------------------------------------------------------------------ */
/*  Coordinate mapping: SUMO metres → Indian lat/lon                  */
/*  We overlay the network on a real Indian corridor (approx           */
/*  New Delhi – Alwar – Jaipur region) so tiles are meaningful.        */
/* ------------------------------------------------------------------ */

// Reference point: centre of the SUMO network ≈ (15000, 0)
// maps to ~26.5°N 76.3°E (Rajasthan corridor)
const ORIGIN_LAT = 26.5;
const ORIGIN_LNG = 76.3;

// SUMO uses metres. 1° latitude ≈ 111320 m, 1° longitude ≈ ~100000 m at 26.5°N
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LNG = 100000;

// Scale factor – the SUMO network spans ~50 km, we stretch it slightly
// to feel like a real railway division
const SCALE = 2.5;

function sumoToLatLng(x, y) {
  return [
    ORIGIN_LAT + (y * SCALE) / M_PER_DEG_LAT,
    ORIGIN_LNG + (x * SCALE) / M_PER_DEG_LNG,
  ];
}

function shapeToLatLngs(shape) {
  return shape.map(([x, y]) => sumoToLatLng(x, y));
}

/* ------------------------------------------------------------------ */
/*  Custom train icon (rotatable)                                     */
/* ------------------------------------------------------------------ */

function trainIcon(status, traction) {
  const color =
    status === "held"
      ? "#b42318"
      : status === "station"
      ? "#0ea5e9"
      : "#1b1b19";
  const label = traction || "T";

  return L.divIcon({
    className: "leaflet-train-icon",
    html: `
      <div style="
        width: 28px; height: 28px;
        background: ${color};
        border: 2.5px solid #fff;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        font-size: 10px;
        font-weight: 700;
        font-family: var(--font-mono, monospace);
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        transition: transform 0.3s ease;
      ">${label}</div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

function blockIcon(dept) {
  const color = dept
    ? getComputedStyle(document.documentElement)
        .getPropertyValue(`--color-${dept === "tms" ? "eng" : dept === "smms" ? "snt" : dept === "tdms" ? "trd" : "coa"}`)
        .trim() || "#52524c"
    : "#52524c";

  return L.divIcon({
    className: "leaflet-block-icon",
    html: `
      <div style="
        width: 18px; height: 18px;
        background: ${color};
        border: 2px solid #fff;
        border-radius: 4px;
        box-shadow: 0 1px 4px rgba(0,0,0,0.25);
      "></div>
    `,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

/* ------------------------------------------------------------------ */
/*  Map auto-fit                                                      */
/* ------------------------------------------------------------------ */

function FitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    }
  }, [map, bounds]);
  return null;
}

/* ------------------------------------------------------------------ */
/*  Color helpers                                                     */
/* ------------------------------------------------------------------ */

const DEPT_HEX = {
  tms: "#2e6b4b",
  smms: "#1d5a96",
  tdms: "#9a5f0c",
  coa: "#4a5563",
};

const STATUS_COLORS = {
  active: 0.95,
  upcoming: 0.4,
  done: 0.3,
  pending: 0.35,
};

/* ------------------------------------------------------------------ */
/*  MAIN COMPONENT                                                    */
/* ------------------------------------------------------------------ */

export default function LeafletMap({
  network,
  blocks,
  trains,
  ghosts,
  trails,
  t,
  selected,
  onSelect,
}) {
  // Convert all section shapes to lat/lng
  const sectionLatLngs = useMemo(() => {
    if (!network?.sections) return {};
    const out = {};
    for (const [id, sec] of Object.entries(network.sections)) {
      out[id] = shapeToLatLngs(sec.shape);
    }
    return out;
  }, [network]);

  // Compute bounds from all sections
  const allBounds = useMemo(() => {
    const pts = Object.values(sectionLatLngs).flat();
    return pts.length ? pts : [[ORIGIN_LAT, ORIGIN_LNG]];
  }, [sectionLatLngs]);

  // Station markers with lat/lng
  const stationMarkers = useMemo(() => {
    if (!network?.stations) return [];
    return network.stations
      .filter((s) => s.pos)
      .map((s) => ({
        ...s,
        latLng: sumoToLatLng(s.pos[0], s.pos[1]),
      }));
  }, [network]);

  // Junction markers
  const junctionMarkers = useMemo(() => {
    if (!network?.junctions) return [];
    return network.junctions
      .filter((j) => j.pos)
      .map((j) => ({
        ...j,
        latLng: sumoToLatLng(j.pos[0], j.pos[1]),
      }));
  }, [network]);

  // Train positions in lat/lng
  const trainMarkers = useMemo(() => {
    if (!trains?.length) return [];
    return trains.map((tr) => ({
      ...tr,
      latLng: sumoToLatLng(tr.x, tr.y),
    }));
  }, [trains]);

  // Ghost train markers
  const ghostMarkers = useMemo(() => {
    if (!ghosts?.length) return [];
    return ghosts.map((g) => ({
      ...g,
      latLng: sumoToLatLng(g.x, g.y),
    }));
  }, [ghosts]);

  // Trail polylines
  const trailLines = useMemo(() => {
    if (!trails) return [];
    return Object.entries(trails)
      .filter(([, pts]) => pts.length > 1)
      .map(([id, pts]) => ({
        id,
        positions: pts.map(([x, y]) => sumoToLatLng(x, y)),
      }));
  }, [trails]);

  // Active blocks mapped to sections
  const blockOverlays = useMemo(() => {
    if (!blocks?.length || !network?.sections) return [];
    return blocks
      .map((b) => {
        const sec = network.sections[b.loc];
        if (!sec) return null;
        const st = blockState(b, t);
        const color = DEPT_HEX[b.dept] || "#52524c";
        const mid = pointAlong(sec.shape, 0.5);
        return {
          ...b,
          state: st,
          color,
          positions: shapeToLatLngs(sec.shape),
          midLatLng: mid ? sumoToLatLng(mid.x, mid.y) : null,
        };
      })
      .filter(Boolean);
  }, [blocks, network, t]);

  return (
    <div className="relative w-full" style={{ height: 560 }}>
      <MapContainer
        center={[ORIGIN_LAT, ORIGIN_LNG]}
        zoom={9}
        scrollWheelZoom={true}
        style={{ height: "100%", width: "100%", borderRadius: "8px" }}
        zoomControl={true}
      >
        {/* ---- Mapbox Full Color Tiles ---- */}
        <TileLayer
          attribution='&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a>'
          url={`https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${process.env.NEXT_PUBLIC_MAPBOX_KEY || "YOUR_MAPBOX_API_KEY"}`}
        />

        <FitBounds bounds={allBounds} />

        {/* ---- Track ballast (wide) ---- */}
        {Object.entries(sectionLatLngs).map(([id, positions]) => (
          <Polyline
            key={`ballast-${id}`}
            positions={positions}
            pathOptions={{
              color: "#d4d4ce",
              weight: 6,
              opacity: 0.6,
              lineCap: "round",
            }}
          />
        ))}

        {/* ---- Rail lines ---- */}
        {Object.entries(sectionLatLngs).map(([id, positions]) => (
          <Polyline
            key={`rail-${id}`}
            positions={positions}
            pathOptions={{
              color: "#6b6b64",
              weight: 2.5,
              opacity: 0.85,
            }}
          >
            <Tooltip sticky>
              <span className="font-mono text-xs">{id.replace("_", " · ")}</span>
            </Tooltip>
          </Polyline>
        ))}

        {/* ---- Block overlays ---- */}
        {blockOverlays.map((b) => (
          <Polyline
            key={`block-${b.id}`}
            positions={b.positions}
            pathOptions={{
              color: b.state === "done" ? "#b9b9b2" : b.color,
              weight: b.state === "active" ? 8 : 5,
              opacity: STATUS_COLORS[b.state] || 0.4,
              dashArray:
                b.state === "upcoming" || b.state === "pending"
                  ? "8 6"
                  : undefined,
              lineCap: "butt",
            }}
            eventHandlers={{
              click: () => onSelect?.(`block:${b.id}`),
            }}
          >
            <Tooltip sticky>
              <div className="text-xs">
                <div className="font-semibold">
                  {b.loc.replace("_", " · ")}
                </div>
                <div className="text-ink-3">
                  {DEPTS[b.dept]?.system || b.dept} · {b.type} block
                </div>
                <div>
                  {b.neverStarted
                    ? "Not started"
                    : `${b.start} – ${b.end}`}
                </div>
                <div
                  className="font-semibold mt-0.5"
                  style={{ color: b.color }}
                >
                  {b.state.toUpperCase()}
                </div>
              </div>
            </Tooltip>
          </Polyline>
        ))}

        {/* ---- Active block markers ---- */}
        {blockOverlays
          .filter((b) => b.state === "active" && b.midLatLng)
          .map((b) => (
            <Marker
              key={`block-marker-${b.id}`}
              position={b.midLatLng}
              icon={blockIcon(b.dept)}
            >
              <Popup>
                <div className="text-xs min-w-[140px]">
                  <div className="font-bold text-sm">{b.loc.replace("_", " · ")}</div>
                  <div className="mt-1">{DEPTS[b.dept]?.name || b.dept}</div>
                  <div>{b.type} block</div>
                  <div className="font-mono mt-1">
                    Window: {b.start}–{b.end}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

        {/* ---- Stations ---- */}
        {stationMarkers.map((s) => (
          <CircleMarker
            key={`stn-${s.id}`}
            center={s.latLng}
            radius={8}
            pathOptions={{
              fillColor: "#ffffff",
              fillOpacity: 1,
              color: "#1b1b19",
              weight: 2.5,
            }}
          >
            <Tooltip permanent direction="bottom" offset={[0, 8]}>
              <span className="font-semibold text-xs tracking-wide">
                {s.name}
              </span>
            </Tooltip>
          </CircleMarker>
        ))}

        {/* ---- Junctions ---- */}
        {junctionMarkers.map((j) => (
          <CircleMarker
            key={`jn-${j.id}`}
            center={j.latLng}
            radius={5}
            pathOptions={{
              fillColor: "#1b1b19",
              fillOpacity: 1,
              color: "#fff",
              weight: 1.5,
            }}
          >
            <Tooltip direction="bottom" offset={[0, 6]}>
              <span className="font-mono text-[10px]">
                {j.id.replace("_", " ")}
              </span>
            </Tooltip>
          </CircleMarker>
        ))}

        {/* ---- Trail lines ---- */}
        {trailLines.map((trail) => (
          <Polyline
            key={`trail-${trail.id}`}
            positions={trail.positions}
            pathOptions={{
              color: "#1b1b19",
              weight: 3,
              opacity: 0.15,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
        ))}

        {/* ---- Ghost trains (timetable reference) ---- */}
        {ghostMarkers.map((g) => (
          <CircleMarker
            key={`ghost-${g.key}`}
            center={g.latLng}
            radius={5}
            pathOptions={{
              fillColor: "transparent",
              fillOpacity: 0,
              color: "#1b1b19",
              weight: 1.5,
              opacity: 0.4,
              dashArray: "3 2",
            }}
          >
            <Tooltip>
              <span className="font-mono text-[10px]">
                Timetable #{g.trainId}
              </span>
            </Tooltip>
          </CircleMarker>
        ))}

        {/* ---- Trains ---- */}
        {trainMarkers.map((tr) => (
          <Marker
            key={`train-${tr.key}`}
            position={tr.latLng}
            icon={trainIcon(tr.status, tr.traction)}
            eventHandlers={{
              click: () => onSelect?.(`train:${tr.key}`),
            }}
          >
            <Popup>
              <div className="text-xs min-w-[120px]">
                <div className="font-bold text-sm">Train #{tr.trainId}</div>
                <div className="mt-1">
                  <span
                    className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold text-white"
                    style={{
                      background:
                        tr.status === "held"
                          ? "#b42318"
                          : tr.status === "station"
                          ? "#0ea5e9"
                          : "#1b1b19",
                    }}
                  >
                    {tr.status === "held"
                      ? "HELD AT SIGNAL"
                      : tr.status === "station"
                      ? "AT STATION"
                      : tr.status === "planned"
                      ? "TIMETABLE"
                      : "RUNNING"}
                  </span>
                </div>
                <div className="font-mono mt-1">{tr.edge.replace("_", " ")}</div>
                {tr.speed != null && (
                  <div className="text-ink-3 mt-0.5">
                    {tr.speed.toFixed(1)} m/s
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* ---- Legend overlay ---- */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-surface/95 backdrop-blur-sm border border-line rounded-lg px-3 py-2.5 elevation-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-ink-3 mb-2">
          Legend
        </div>
        <div className="space-y-1.5 text-[11px]">
          {Object.entries(DEPT_HEX).map(([key, color]) => (
            <div key={key} className="flex items-center gap-2">
              <span
                className="w-4 h-1.5 rounded-sm"
                style={{ background: color }}
              />
              <span>{DEPTS[key]?.name || key}</span>
            </div>
          ))}
          <div className="border-t border-line pt-1.5 mt-1.5 flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-ink inline-grid place-items-center text-[8px] text-white font-bold">
              T
            </span>
            <span>Train</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-bad inline-grid place-items-center text-[8px] text-white font-bold">
              !
            </span>
            <span>Held at signal</span>
          </div>
        </div>
      </div>
    </div>
  );
}
