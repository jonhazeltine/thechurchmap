import { useEffect } from "react";
import type mapboxgl from "mapbox-gl";
import type { Boundary } from "@shared/schema";
import { MAP_AREA_COLORS } from "@shared/schema";
import { findFirstLabelLayerId } from "./constants";

interface BoundaryLayerProps {
  map: React.MutableRefObject<mapboxgl.Map | null>;
  boundaries: Boundary[];
  hoverBoundary: Boundary | null;
  visibleBoundaryIds: Set<string>;
  drawingPrimaryArea: boolean;
  filterBoundaries: Boundary[];
}

export function BoundaryLayer({
  map,
  boundaries,
  hoverBoundary,
  visibleBoundaryIds,
  drawingPrimaryArea,
  filterBoundaries,
}: BoundaryLayerProps) {
  useEffect(() => {
    if (!map.current) return;

    const renderBoundaries = () => {
      if (!map.current || !map.current.isStyleLoaded()) return;

      // When drawing primary area, remove all boundaries for a clean drawing experience
      if (drawingPrimaryArea) {
        if (map.current.getLayer('boundaries-fill')) map.current.removeLayer('boundaries-fill');
        if (map.current.getLayer('boundaries-outline')) map.current.removeLayer('boundaries-outline');
        if (map.current.getLayer('boundary-preview-fill')) map.current.removeLayer('boundary-preview-fill');
        if (map.current.getLayer('boundary-preview-outline')) map.current.removeLayer('boundary-preview-outline');
        if (map.current.getSource('boundaries')) map.current.removeSource('boundaries');
        if (map.current.getSource('boundary-preview')) map.current.removeSource('boundary-preview');
        if (map.current.getLayer('filter-boundary-fill')) map.current.removeLayer('filter-boundary-fill');
        if (map.current.getLayer('filter-boundary-outline')) map.current.removeLayer('filter-boundary-outline');
        if (map.current.getSource('filter-boundaries')) map.current.removeSource('filter-boundaries');
        return;
      }

      const firstLabelLayer = findFirstLabelLayerId(map.current);

      // Remove existing boundary layers
      if (map.current.getLayer('boundaries-fill')) map.current.removeLayer('boundaries-fill');
      if (map.current.getLayer('boundaries-outline')) map.current.removeLayer('boundaries-outline');
      if (map.current.getLayer('boundary-preview-fill')) map.current.removeLayer('boundary-preview-fill');
      if (map.current.getLayer('boundary-preview-outline')) map.current.removeLayer('boundary-preview-outline');
      if (map.current.getSource('boundaries')) map.current.removeSource('boundaries');
      if (map.current.getSource('boundary-preview')) map.current.removeSource('boundary-preview');

      // Filter boundaries to only include visible ones
      const visibleBoundaries = boundaries.filter(b => visibleBoundaryIds.has(b.id));

      // Render attached boundaries
      if (visibleBoundaries.length > 0) {
        map.current.addSource('boundaries', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: visibleBoundaries.map((boundary) => ({
              type: 'Feature',
              id: boundary.id,
              properties: {
                id: boundary.id,
                name: boundary.name,
                type: boundary.type,
              },
              geometry: boundary.geometry,
            })),
          },
        });

        map.current.addLayer({
          id: 'boundaries-fill',
          type: 'fill',
          source: 'boundaries',
          paint: {
            'fill-color': MAP_AREA_COLORS.boundary,
            'fill-opacity': 0.15,
          },
        }, firstLabelLayer);

        map.current.addLayer({
          id: 'boundaries-outline',
          type: 'line',
          source: 'boundaries',
          paint: {
            'line-color': MAP_AREA_COLORS.boundaryOutline,
            'line-width': 3,
          },
        }, firstLabelLayer);
      }

      // Filter boundaries
      if (map.current.getLayer('filter-boundary-fill')) map.current.removeLayer('filter-boundary-fill');
      if (map.current.getLayer('filter-boundary-outline')) map.current.removeLayer('filter-boundary-outline');
      if (map.current.getSource('filter-boundaries')) map.current.removeSource('filter-boundaries');

      if (filterBoundaries.length > 0) {
        map.current.addSource('filter-boundaries', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: filterBoundaries.map((boundary) => ({
              type: 'Feature',
              id: boundary.id,
              properties: {
                id: boundary.id,
                name: boundary.name,
                type: boundary.type,
              },
              geometry: boundary.geometry,
            })),
          },
        });

        map.current.addLayer({
          id: 'filter-boundary-fill',
          type: 'fill',
          source: 'filter-boundaries',
          paint: {
            'fill-color': '#6366f1',
            'fill-opacity': 0.08,
          },
        }, firstLabelLayer);

        map.current.addLayer({
          id: 'filter-boundary-outline',
          type: 'line',
          source: 'filter-boundaries',
          paint: {
            'line-color': '#6366f1',
            'line-width': 2,
            'line-dasharray': [3, 2],
          },
        }, firstLabelLayer);
      }

      // Hover boundary preview
      if (hoverBoundary && hoverBoundary.geometry) {
        map.current.addSource('boundary-preview', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: hoverBoundary.geometry,
          },
        });

        map.current.addLayer({
          id: 'boundary-preview-fill',
          type: 'fill',
          source: 'boundary-preview',
          paint: {
            'fill-color': 'rgba(150,150,150,0.25)',
            'fill-opacity': 1,
          },
        }, firstLabelLayer);

        map.current.addLayer({
          id: 'boundary-preview-outline',
          type: 'line',
          source: 'boundary-preview',
          paint: {
            'line-color': 'rgba(100,100,100,0.9)',
            'line-width': 2,
            'line-dasharray': [4, 2],
          },
        }, firstLabelLayer);
      }
    };

    const mapInstance = map.current;
    let didRender = false;

    if (mapInstance.isStyleLoaded()) {
      renderBoundaries();
      didRender = true;
    } else {
      mapInstance.once('load', () => {
        renderBoundaries();
        didRender = true;
      });
    }

    const handleIdle = () => {
      if (!didRender && mapInstance.isStyleLoaded()) {
        renderBoundaries();
      }
    };
    mapInstance.once('idle', handleIdle);

    return () => {
      if (mapInstance) {
        mapInstance.off('load', renderBoundaries);
        mapInstance.off('idle', handleIdle);
      }
    };
  }, [boundaries, hoverBoundary, visibleBoundaryIds, drawingPrimaryArea, filterBoundaries]);

  return null;
}
