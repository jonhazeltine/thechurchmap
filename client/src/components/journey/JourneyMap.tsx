import { useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

interface JourneyMapProps {
  /** Coordinates to fly to. null = no fly-to */
  target: { lng: number; lat: number } | null;
  /** Current slide index — forces fly-to even if coords are same */
  slideIndex?: number;
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
export default function JourneyMap({ target, slideIndex = 0, onArrived }: JourneyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const orbitRef = useRef<number | null>(null);
  const glowMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const arrivedRef = useRef(onArrived);
  arrivedRef.current = onArrived;

  // Stop any active orbit animation
  const stopOrbit = useCallback(() => {
    if (orbitRef.current !== null) {
      cancelAnimationFrame(orbitRef.current);
      orbitRef.current = null;
    }
  }, []);

  // Start slow orbit around the current center
  const startOrbit = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    stopOrbit();

    const ORBIT_SPEED = -3; // degrees per second (negative = clockwise/rightward)
    let lastTime = performance.now();

    const animate = (now: number) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      const currentBearing = map.getBearing();
      map.setBearing(currentBearing + ORBIT_SPEED * delta);
      orbitRef.current = requestAnimationFrame(animate);
    };
    orbitRef.current = requestAnimationFrame(animate);

    // Stop orbit on user interaction
    const stopOnInteraction = () => {
      stopOrbit();
      map.off("mousedown", stopOnInteraction);
      map.off("touchstart", stopOnInteraction);
      map.off("wheel", stopOnInteraction);
    };
    map.on("mousedown", stopOnInteraction);
    map.on("touchstart", stopOnInteraction);
    map.on("wheel", stopOnInteraction);
  }, [stopOrbit]);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const token = import.meta.env.VITE_MAPBOX_TOKEN || "";
    if (!token) return;
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
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

  // Place an animated glory-glow HTML marker at the target
  const highlightAtPoint = useCallback(
    (lngLat: { lng: number; lat: number }) => {
      const map = mapRef.current;
      if (!map) return;
      clearHighlights();

      // Create the glow element — CSS-animated, no Mapbox layer flickering
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

  // Fly-to when target changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !target) {
      stopOrbit();
      clearHighlights();
      return;
    }
    stopOrbit();

    // Wait for map to be loaded
    const flyId = slideIndex; // Track which fly-to this is
    const doFlyTo = () => {
      clearHighlights();

      // Randomize bearing per step for visual variety
      const bearing = -17 + ((slideIndex * 47) % 60) - 30;

      // Zoom out briefly first for dramatic effect, then fly in
      map.flyTo({
        center: [target.lng, target.lat],
        zoom: 17,
        pitch: 60,
        bearing,
        speed: 0.6,
        curve: 1.6,
        essential: true,
      });

      // Use a timeout fallback in case moveend doesn't fire
      let arrived = false;
      const onArrive = () => {
        if (arrived) return;
        arrived = true;
        map.off("moveend", onMoveEnd);
        setTimeout(() => {
          highlightAtPoint(target);
          startOrbit();
          arrivedRef.current?.();
        }, 300);
      };

      const onMoveEnd = () => onArrive();
      map.on("moveend", onMoveEnd);

      // Fallback: if moveend doesn't fire within 5s, force arrival
      setTimeout(() => onArrive(), 5000);
    };

    if (map.loaded() && map.isStyleLoaded()) {
      doFlyTo();
    } else {
      const onReady = () => {
        map.off("load", onReady);
        map.off("style.load", onReady);
        doFlyTo();
      };
      map.on("load", onReady);
      map.on("style.load", onReady);
    }
  }, [target?.lng, target?.lat, slideIndex, clearHighlights, highlightAtPoint, stopOrbit, startOrbit]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ zIndex: 0 }}
    />
  );
}
