import { useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

interface JourneyMapProps {
  /** Coordinates to fly to. null = no fly-to */
  target: { lng: number; lat: number } | null;
  /** Next step's coordinates — used to face toward next destination */
  nextTarget?: { lng: number; lat: number } | null;
  /** Current slide index — forces fly-to even if coords are same */
  slideIndex?: number;
  /** Called when fly-to animation ends */
  onArrived?: () => void;
  /** Boundary polygon geometry to highlight (for boundary steps) */
  boundaryGeometry?: any | null;
  /** Context church pins to show within a boundary */
  contextPins?: Array<{ lng: number; lat: number; name: string }> | null;
  /** Bounding box [minLng, minLat, maxLng, maxLat] for wide-area steps (states, countries) */
  viewBbox?: [number, number, number, number] | null;
}

const BUILDING_HIGHLIGHT_SOURCE = "journey-building-highlight";
const BUILDING_HIGHLIGHT_LAYER = "journey-building-highlight-fill";
const BUILDING_HIGHLIGHT_GLOW = "journey-building-highlight-glow";
const PULSE_MARKER_SOURCE = "journey-pulse-marker";
const PULSE_MARKER_LAYER = "journey-pulse-marker-circle";
const PULSE_MARKER_GLOW_LAYER = "journey-pulse-marker-glow";
const BOUNDARY_SOURCE = "journey-boundary";
const BOUNDARY_FILL_LAYER = "journey-boundary-fill";
const BOUNDARY_OUTLINE_LAYER = "journey-boundary-outline";
const CONTEXT_PINS_SOURCE = "journey-context-pins";
const CONTEXT_PINS_GLOW_LAYER = "journey-context-pins-glow";
const CONTEXT_PINS_LAYER = "journey-context-pins-dot";
const CONTEXT_PINS_LABELS = "journey-context-pins-labels";

/**
 * Full-screen interactive Mapbox map for the prayer journey.
 * Handles fly-to animations, 3D buildings, building highlighting,
 * boundary polygon rendering, and contextual church pins.
 */
export default function JourneyMap({ target, nextTarget, slideIndex = 0, onArrived, boundaryGeometry, contextPins, viewBbox }: JourneyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const orbitRef = useRef<number | null>(null);
  const glowMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const arrivedRef = useRef(onArrived);
  arrivedRef.current = onArrived;

  // Fade satellite overlay in/out
  const fadeSatellite = useCallback((show: boolean, durationMs = 2000) => {
    const map = mapRef.current;
    if (!map || !map.getLayer("satellite-overlay-layer")) return;
    const start = performance.now();
    const startOpacity = show ? 0 : 0.85;
    const endOpacity = show ? 0.85 : 0;
    const animate = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);
      const eased = t * t * (3 - 2 * t); // smoothstep
      const opacity = startOpacity + (endOpacity - startOpacity) * eased;
      try { map.setPaintProperty("satellite-overlay-layer", "raster-opacity", opacity); } catch {}
      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, []);

  // Stop any active orbit — just stop the map's native animation
  const stopOrbit = useCallback(() => {
    const map = mapRef.current;
    if (orbitRef.current !== null) {
      orbitRef.current = null;
      if (map) map.stop();
    }
  }, []);

  // Start slow orbit using Mapbox's native rotateTo (won't conflict with flyTo)
  const startOrbit = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    stopOrbit();

    // Rotate 360 degrees over ~120 seconds (slow cinematic orbit)
    const currentBearing = map.getBearing();
    orbitRef.current = 1; // flag that orbit is active
    map.rotateTo(currentBearing - 360, {
      duration: 120000,
      easing: (t: number) => t, // linear
    });
  }, [stopOrbit]);

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
      // Add satellite raster as an overlay (starts hidden, fades in on arrival)
      if (!map.getSource("satellite-overlay")) {
        map.addSource("satellite-overlay", {
          type: "raster",
          url: "mapbox://mapbox.satellite",
          tileSize: 256,
        });
        map.addLayer({
          id: "satellite-overlay-layer",
          type: "raster",
          source: "satellite-overlay",
          paint: { "raster-opacity": 0 },
        }, map.getStyle().layers?.find(l => l.type === "symbol")?.id);
      }

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

      // Boundary polygon source/layers (for boundary steps)
      if (!map.getSource(BOUNDARY_SOURCE)) {
        map.addSource(BOUNDARY_SOURCE, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: BOUNDARY_FILL_LAYER,
          type: "fill",
          source: BOUNDARY_SOURCE,
          paint: {
            "fill-color": "#3B82F6",
            "fill-opacity": 0.2,
          },
        });
        map.addLayer({
          id: BOUNDARY_OUTLINE_LAYER,
          type: "line",
          source: BOUNDARY_SOURCE,
          paint: {
            "line-color": "#2563EB",
            "line-width": 3,
            "line-opacity": 0.8,
          },
        });
      }

      // Contextual church pins source/layers (glory glow on boundary steps)
      if (!map.getSource(CONTEXT_PINS_SOURCE)) {
        map.addSource(CONTEXT_PINS_SOURCE, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        // Outer glow — white-gold, ethereal
        map.addLayer({
          id: CONTEXT_PINS_GLOW_LAYER,
          type: "circle",
          source: CONTEXT_PINS_SOURCE,
          paint: {
            "circle-radius": 18,
            "circle-color": "#FFE082",
            "circle-opacity": 0.3,
            "circle-blur": 1,
          },
        });
        // Inner dot — bright white core with gold stroke
        map.addLayer({
          id: CONTEXT_PINS_LAYER,
          type: "circle",
          source: CONTEXT_PINS_SOURCE,
          paint: {
            "circle-radius": 5,
            "circle-color": "#FFF8E1",
            "circle-opacity": 0.95,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#FFD54F",
          },
        });
        // Name labels above pins
        map.addLayer({
          id: CONTEXT_PINS_LABELS,
          type: "symbol",
          source: CONTEXT_PINS_SOURCE,
          layout: {
            "text-field": ["get", "name"],
            "text-size": 11,
            "text-offset": [0, -1.8],
            "text-anchor": "bottom",
            "text-max-width": 12,
            "text-optional": true,
            "text-allow-overlap": false,
          },
          paint: {
            "text-color": "#FFFFFF",
            "text-halo-color": "rgba(0,0,0,0.7)",
            "text-halo-width": 1.5,
            "text-opacity": 0.9,
          },
        });

        // Click handler for context pins — show popup with church name
        map.on("click", CONTEXT_PINS_LAYER, (e: any) => {
          if (!e.features?.length) return;
          const name = e.features[0].properties?.name || "Church";
          const coords = e.features[0].geometry.coordinates.slice();
          new mapboxgl.Popup({ closeButton: false, closeOnClick: true, offset: 12 })
            .setLngLat(coords)
            .setHTML(`<div style="font-size:13px;font-weight:600;padding:2px 4px">${name}</div>`)
            .addTo(map);
        });
        map.on("mouseenter", CONTEXT_PINS_LAYER, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", CONTEXT_PINS_LAYER, () => { map.getCanvas().style.cursor = ""; });
      }
    });

    mapRef.current = map;

    return () => {
      stopOrbit();
      clearHighlights();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear highlights — remove HTML glow marker
  const clearHighlights = useCallback(() => {
    if (glowMarkerRef.current) {
      glowMarkerRef.current.remove();
      glowMarkerRef.current = null;
    }
  }, []);

  // Clear boundary polygon
  const clearBoundary = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource(BOUNDARY_SOURCE) as mapboxgl.GeoJSONSource;
    if (src) src.setData({ type: "FeatureCollection", features: [] });
    const pinSrc = map.getSource(CONTEXT_PINS_SOURCE) as mapboxgl.GeoJSONSource;
    if (pinSrc) pinSrc.setData({ type: "FeatureCollection", features: [] });
  }, []);

  // Place an animated glory-glow HTML marker at the target
  const highlightAtPoint = useCallback(
    (lngLat: { lng: number; lat: number }) => {
      const map = mapRef.current;
      if (!map) return;
      clearHighlights();

      const el = document.createElement("div");
      el.className = "journey-glow-marker";
      el.innerHTML = `
        <div class="glow-ring glow-ring-outer"></div>
        <div class="glow-ring glow-ring-middle"></div>
        <div class="glow-ring glow-ring-inner"></div>
        <div class="glow-core"></div>
      `;

      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([lngLat.lng, lngLat.lat])
        .addTo(map);

      glowMarkerRef.current = marker;
    },
    [clearHighlights]
  );

  // Show boundary polygon
  const showBoundary = useCallback((geometry: any) => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource(BOUNDARY_SOURCE) as mapboxgl.GeoJSONSource;
    if (src) {
      src.setData({
        type: "Feature",
        properties: {},
        geometry,
      } as any);
    }
  }, []);

  // Show context church pins
  const showContextPins = useCallback((pins: Array<{ lng: number; lat: number; name: string }>) => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource(CONTEXT_PINS_SOURCE) as mapboxgl.GeoJSONSource;
    if (src) {
      src.setData({
        type: "FeatureCollection",
        features: pins.map(p => ({
          type: "Feature" as const,
          properties: { name: p.name },
          geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
        })),
      });
    }
  }, []);

  // Fly-to when target changes — instantly responsive to rapid Next/Back
  const flyCounterRef = useRef(0);
  const moveendHandlerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !target) {
      stopOrbit();
      clearHighlights();
      clearBoundary();
      return;
    }

    const thisFlightId = ++flyCounterRef.current;

    // Cancel any in-progress animation instantly
    if (moveendHandlerRef.current) {
      map.off("moveend", moveendHandlerRef.current);
      moveendHandlerRef.current = null;
    }
    map.stop();
    stopOrbit();
    clearHighlights();
    clearBoundary();

    // Fade satellite out quickly for the transition
    fadeSatellite(false, 400);

    const isMobile = window.innerWidth < 768;
    const isBoundaryStep = !!boundaryGeometry;

    // Fade satellite back in during flight
    const satTimer = setTimeout(() => {
      if (flyCounterRef.current !== thisFlightId) return;
      fadeSatellite(true, isBoundaryStep ? 800 : 1500);
    }, 800);

    if (isBoundaryStep) {
      // Boundary step: fitBounds to show the full polygon
      showBoundary(boundaryGeometry);
      if (contextPins && contextPins.length > 0) {
        showContextPins(contextPins);
      }

      // Compute bbox from geometry
      let minLng = 180, minLat = 90, maxLng = -180, maxLat = -90;
      const extractCoords = (coords: any) => {
        if (typeof coords[0] === "number") {
          minLng = Math.min(minLng, coords[0]);
          minLat = Math.min(minLat, coords[1]);
          maxLng = Math.max(maxLng, coords[0]);
          maxLat = Math.max(maxLat, coords[1]);
        } else {
          for (const c of coords) extractCoords(c);
        }
      };
      if (boundaryGeometry?.coordinates) extractCoords(boundaryGeometry.coordinates);

      const bounds = new mapboxgl.LngLatBounds(
        [minLng, minLat],
        [maxLng, maxLat]
      );

      map.fitBounds(bounds, {
        padding: isMobile
          ? { top: 100, bottom: 120, left: 40, right: 40 }
          : { top: 80, bottom: 60, left: 40, right: 220 },
        pitch: 45,
        bearing: 0,
        duration: 2000,
        essential: true,
      });

      const onArrive = () => {
        if (flyCounterRef.current !== thisFlightId) return;
        moveendHandlerRef.current = null;
        // No orbit for boundary steps — keep the overview static
        arrivedRef.current?.();
      };

      moveendHandlerRef.current = onArrive;
      map.once("moveend", onArrive);
    } else if (viewBbox) {
      // Has a bounding box — country, state, or city
      const lngSpan = Math.abs(viewBbox[2] - viewBbox[0]);
      const isCountryScale = lngSpan > 20;

      if (isCountryScale) {
        // Country: fly to continental US center (don't trust geocoder
        // center which lands in Pacific NW due to Alaska/Hawaii skew)
        map.flyTo({
          center: [-98.5, 39.5],
          zoom: isMobile ? 3.8 : 4.2,
          pitch: 30,
          bearing: -60,
          speed: 0.6,
          curve: 1.4,
          duration: 2500,
          essential: true,
        });
      } else {
        // State, city, or region: fitBounds to show the full area
        const bounds = new mapboxgl.LngLatBounds(
          [viewBbox[0], viewBbox[1]],
          [viewBbox[2], viewBbox[3]]
        );
        map.fitBounds(bounds, {
          padding: isMobile
            ? { top: 40, bottom: 60, left: 10, right: 10 }
            : { top: 30, bottom: 20, left: 10, right: 160 },
          pitch: 45,
          bearing: -30,
          duration: 2500,
          essential: true,
        });
      }

      const onArrive = () => {
        if (flyCounterRef.current !== thisFlightId) return;
        moveendHandlerRef.current = null;
        arrivedRef.current?.();
      };

      moveendHandlerRef.current = onArrive;
      map.once("moveend", onArrive);
    } else {
      // Point step: normal fly-to with orbit
      let bearing = 0;
      if (nextTarget) {
        const dLng = nextTarget.lng - target.lng;
        const dLat = nextTarget.lat - target.lat;
        bearing = Math.atan2(dLng, dLat) * (180 / Math.PI);
      }

      map.flyTo({
        center: [target.lng, target.lat],
        zoom: isMobile ? 17.5 : 18,
        pitch: 78,
        bearing,
        speed: 0.8,
        curve: 1.4,
        essential: true,
        padding: isMobile
          ? { top: 80, bottom: 60, left: 0, right: 0 }
          : { top: 60, bottom: 40, left: 0, right: 180 },
      });

      const onArrive = () => {
        if (flyCounterRef.current !== thisFlightId) return;
        moveendHandlerRef.current = null;
        highlightAtPoint(target);
        startOrbit();
        arrivedRef.current?.();
      };

      moveendHandlerRef.current = onArrive;
      map.once("moveend", onArrive);
    }

    // Safety fallback — if moveend never fires
    const fallbackTimer = setTimeout(() => {
      if (flyCounterRef.current === thisFlightId && moveendHandlerRef.current) {
        moveendHandlerRef.current();
      }
    }, 5000);

    return () => {
      clearTimeout(satTimer);
      clearTimeout(fallbackTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideIndex]);

  // Update context pins when they load (async, arrives after slide change)
  useEffect(() => {
    if (!mapRef.current) return;
    if (contextPins && contextPins.length > 0 && boundaryGeometry) {
      showContextPins(contextPins);
    } else {
      const src = mapRef.current.getSource(CONTEXT_PINS_SOURCE) as mapboxgl.GeoJSONSource;
      if (src) src.setData({ type: "FeatureCollection", features: [] });
    }
  }, [contextPins, boundaryGeometry, showContextPins]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ zIndex: 0 }}
    />
  );
}
