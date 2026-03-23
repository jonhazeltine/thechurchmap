import { useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

interface JourneyMapProps {
  /** Coordinates to fly to. null = no fly-to */
  target: { lng: number; lat: number } | null;
  /** Called when fly-to animation ends */
  onArrived?: () => void;
}

const BUILDING_HIGHLIGHT_SOURCE = "journey-building-highlight";
const BUILDING_HIGHLIGHT_LAYER = "journey-building-highlight-fill";
const BUILDING_HIGHLIGHT_GLOW = "journey-building-highlight-glow";
const PULSE_MARKER_SOURCE = "journey-pulse-marker";
const PULSE_MARKER_LAYER = "journey-pulse-marker-circle";
const PULSE_MARKER_GLOW_LAYER = "journey-pulse-marker-glow";

/**
 * Full-screen interactive Mapbox map for the prayer journey.
 * Handles fly-to animations, 3D buildings, and building highlighting.
 */
export default function JourneyMap({ target, onArrived }: JourneyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const arrivedRef = useRef(onArrived);
  arrivedRef.current = onArrived;

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const token = import.meta.env.VITE_MAPBOX_TOKEN || "";
    if (!token) return;
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: target ? [target.lng, target.lat] : [-85.67, 42.96],
      zoom: 15,
      pitch: 60,
      bearing: -17,
      antialias: true,
      attributionControl: false,
    });

    map.on("style.load", () => {
      // Add 3D buildings layer if not already present
      const layers = map.getStyle().layers || [];
      const labelLayerId = layers.find(
        (layer: any) => layer.type === "symbol" && layer.layout?.["text-field"]
      )?.id;

      if (!map.getLayer("3d-buildings")) {
        map.addLayer(
          {
            id: "3d-buildings",
            source: "composite",
            "source-layer": "building",
            filter: ["==", "extrude", "true"],
            type: "fill-extrusion",
            minzoom: 14,
            paint: {
              "fill-extrusion-color": "#c8ccd0",
              "fill-extrusion-height": [
                "interpolate",
                ["linear"],
                ["zoom"],
                14, 0,
                14.5, ["get", "height"],
              ],
              "fill-extrusion-base": [
                "interpolate",
                ["linear"],
                ["zoom"],
                14, 0,
                14.5, ["get", "min_height"],
              ],
              "fill-extrusion-opacity": 0.7,
            },
          },
          labelLayerId
        );
      }

      // Prepare highlight source/layers (empty at first)
      if (!map.getSource(BUILDING_HIGHLIGHT_SOURCE)) {
        map.addSource(BUILDING_HIGHLIGHT_SOURCE, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        // Glow layer (larger, semi-transparent)
        map.addLayer({
          id: BUILDING_HIGHLIGHT_GLOW,
          type: "fill-extrusion",
          source: BUILDING_HIGHLIGHT_SOURCE,
          paint: {
            "fill-extrusion-color": "#f59e0b",
            "fill-extrusion-height": ["coalesce", ["get", "height"], 15],
            "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
            "fill-extrusion-opacity": 0.35,
          },
        });
        // Main highlight layer
        map.addLayer({
          id: BUILDING_HIGHLIGHT_LAYER,
          type: "fill-extrusion",
          source: BUILDING_HIGHLIGHT_SOURCE,
          paint: {
            "fill-extrusion-color": "#f59e0b",
            "fill-extrusion-height": ["coalesce", ["get", "height"], 15],
            "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
            "fill-extrusion-opacity": 0.85,
          },
        });
      }

      // Pulse marker source/layers (fallback when no building found)
      if (!map.getSource(PULSE_MARKER_SOURCE)) {
        map.addSource(PULSE_MARKER_SOURCE, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        // Outer glow
        map.addLayer({
          id: PULSE_MARKER_GLOW_LAYER,
          type: "circle",
          source: PULSE_MARKER_SOURCE,
          paint: {
            "circle-radius": 30,
            "circle-color": "#f59e0b",
            "circle-opacity": 0.25,
            "circle-blur": 1,
          },
        });
        // Inner dot
        map.addLayer({
          id: PULSE_MARKER_LAYER,
          type: "circle",
          source: PULSE_MARKER_SOURCE,
          paint: {
            "circle-radius": 10,
            "circle-color": "#f59e0b",
            "circle-opacity": 0.9,
            "circle-stroke-width": 3,
            "circle-stroke-color": "#ffffff",
          },
        });
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear highlights helper
  const clearHighlights = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const emptyFC = { type: "FeatureCollection" as const, features: [] };
    try {
      const bldgSrc = map.getSource(BUILDING_HIGHLIGHT_SOURCE) as mapboxgl.GeoJSONSource;
      if (bldgSrc) bldgSrc.setData(emptyFC);
      const pulseSrc = map.getSource(PULSE_MARKER_SOURCE) as mapboxgl.GeoJSONSource;
      if (pulseSrc) pulseSrc.setData(emptyFC);
    } catch {
      // sources may not exist yet
    }
  }, []);

  // Highlight building at a point, or place a pulse marker as fallback
  const highlightAtPoint = useCallback(
    (lngLat: { lng: number; lat: number }) => {
      const map = mapRef.current;
      if (!map) return;
      clearHighlights();

      // Try to query the building footprint at the target coordinates
      const point = map.project([lngLat.lng, lngLat.lat]);
      // Query a small box around the point for better hit detection
      const bbox: [mapboxgl.PointLike, mapboxgl.PointLike] = [
        [point.x - 15, point.y - 15],
        [point.x + 15, point.y + 15],
      ];

      const buildingFeatures = map.queryRenderedFeatures(bbox, {
        layers: ["3d-buildings"],
      });

      if (buildingFeatures.length > 0) {
        // Use the first building found
        const feature = buildingFeatures[0];
        const bldgSrc = map.getSource(BUILDING_HIGHLIGHT_SOURCE) as mapboxgl.GeoJSONSource;
        if (bldgSrc) {
          bldgSrc.setData({
            type: "FeatureCollection",
            features: [feature as any],
          });
        }
      } else {
        // Fallback: pulsing circle marker
        const pulseSrc = map.getSource(PULSE_MARKER_SOURCE) as mapboxgl.GeoJSONSource;
        if (pulseSrc) {
          pulseSrc.setData({
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                geometry: {
                  type: "Point",
                  coordinates: [lngLat.lng, lngLat.lat],
                },
                properties: {},
              },
            ],
          });
        }
      }
    },
    [clearHighlights]
  );

  // Fly-to when target changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !target) {
      clearHighlights();
      return;
    }

    // Wait for map to be loaded
    const doFlyTo = () => {
      // Randomize bearing slightly per step for visual variety
      const bearing = -17 + (target.lng * 100 % 60) - 30;

      map.flyTo({
        center: [target.lng, target.lat],
        zoom: 17,
        pitch: 60,
        bearing,
        speed: 0.8,
        curve: 1.4,
        essential: true,
      });

      // After fly-to completes, highlight building and notify parent
      const onMoveEnd = () => {
        map.off("moveend", onMoveEnd);
        // Small delay to let tiles render before querying features
        setTimeout(() => {
          highlightAtPoint(target);
          arrivedRef.current?.();
        }, 400);
      };
      map.on("moveend", onMoveEnd);
    };

    if (map.loaded()) {
      doFlyTo();
    } else {
      map.on("load", doFlyTo);
    }
  }, [target?.lng, target?.lat, clearHighlights, highlightAtPoint]);

  // Pulse animation for the glow circle
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let frame: number;
    let start = performance.now();

    const animate = (now: number) => {
      const elapsed = now - start;
      const t = (Math.sin(elapsed / 600) + 1) / 2; // 0..1 oscillation
      try {
        if (map.getLayer(PULSE_MARKER_GLOW_LAYER)) {
          map.setPaintProperty(PULSE_MARKER_GLOW_LAYER, "circle-radius", 20 + t * 20);
          map.setPaintProperty(PULSE_MARKER_GLOW_LAYER, "circle-opacity", 0.15 + t * 0.15);
        }
        if (map.getLayer(BUILDING_HIGHLIGHT_GLOW)) {
          map.setPaintProperty(BUILDING_HIGHLIGHT_GLOW, "fill-extrusion-opacity", 0.2 + t * 0.2);
        }
      } catch {
        // layer may not exist yet
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ zIndex: 0 }}
    />
  );
}
