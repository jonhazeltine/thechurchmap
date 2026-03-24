import { createContext, useContext } from "react";
import type mapboxgl from "mapbox-gl";
import type MapboxDraw from "@mapbox/mapbox-gl-draw";

export interface MapContextValue {
  map: React.MutableRefObject<mapboxgl.Map | null>;
  draw: React.MutableRefObject<MapboxDraw | null>;
  mapContainer: React.MutableRefObject<HTMLDivElement | null>;
  markersRef: React.MutableRefObject<Map<string, mapboxgl.Marker>>;
  popupsRef: React.MutableRefObject<Map<string, mapboxgl.Popup>>;
  markerSizeUpdatersRef: React.MutableRefObject<Map<string, (selectedId?: string | null) => void>>;
  markerInteractionRef: React.MutableRefObject<boolean>;
}

export const MapContext = createContext<MapContextValue | null>(null);

export function useMapInstance(): MapContextValue {
  const context = useContext(MapContext);
  if (!context) {
    throw new Error("useMapInstance must be used within a MapContext.Provider");
  }
  return context;
}
