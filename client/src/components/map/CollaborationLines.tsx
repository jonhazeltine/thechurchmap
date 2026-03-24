import { useEffect } from "react";
import type mapboxgl from "mapbox-gl";
import type { CollaborationLine } from "./types";
import { COLLABORATION_LAYERS, COLLABORATION_SOURCE_ID, findFirstLabelLayerId } from "./constants";

interface CollaborationLinesProps {
  map: React.MutableRefObject<mapboxgl.Map | null>;
  collaborationLines: CollaborationLine[];
}

export function CollaborationLinesLayer({ map, collaborationLines }: CollaborationLinesProps) {
  useEffect(() => {
    if (!map.current) return;

    const renderCollaborationLines = () => {
      if (!map.current || !map.current.isStyleLoaded()) return;

      // Remove existing collaboration layers
      for (const layerId of COLLABORATION_LAYERS) {
        if (map.current.getLayer(layerId)) {
          map.current.removeLayer(layerId);
        }
      }
      if (map.current.getSource(COLLABORATION_SOURCE_ID)) {
        map.current.removeSource(COLLABORATION_SOURCE_ID);
      }

      // Don't render if no lines
      if (!collaborationLines || collaborationLines.length === 0) return;

      // Build GeoJSON FeatureCollection with LineString features
      const lineFeatures: any[] = [];
      const overlapFeatures: any[] = [];

      for (const line of collaborationLines) {
        // Create line from source to partner
        lineFeatures.push({
          type: 'Feature',
          properties: {
            id: line.id,
            partnerId: line.partnerId,
            partnerName: line.partnerName,
            status: line.status,
            hasOverlap: line.hasOverlap,
            lineType: 'partner'
          },
          geometry: {
            type: 'LineString',
            coordinates: [line.sourceCoords, line.targetCoords]
          }
        });

        // If there's overlap, add a line to the centroid and a point marker
        if (line.hasOverlap && line.overlapCentroid) {
          lineFeatures.push({
            type: 'Feature',
            properties: {
              id: `${line.id}-overlap`,
              partnerId: line.partnerId,
              partnerName: line.partnerName,
              status: line.status,
              hasOverlap: true,
              lineType: 'overlap'
            },
            geometry: {
              type: 'LineString',
              coordinates: [line.sourceCoords, line.overlapCentroid]
            }
          });

          overlapFeatures.push({
            type: 'Feature',
            properties: {
              id: line.id,
              partnerName: line.partnerName,
              featureType: 'overlap-point'
            },
            geometry: {
              type: 'Point',
              coordinates: line.overlapCentroid
            }
          });
        }
      }

      const geojson = {
        type: 'FeatureCollection',
        features: [...lineFeatures, ...overlapFeatures]
      };

      map.current.addSource(COLLABORATION_SOURCE_ID, {
        type: 'geojson',
        data: geojson as any
      });

      const beforeId = findFirstLabelLayerId(map.current);

      // Glow effect for active collaboration lines
      map.current.addLayer({
        id: 'collaboration-lines-glow',
        type: 'line',
        source: COLLABORATION_SOURCE_ID,
        filter: ['all',
          ['==', ['geometry-type'], 'LineString'],
          ['==', ['get', 'status'], 'active']
        ],
        paint: {
          'line-color': '#10B981',
          'line-width': 10,
          'line-opacity': 0.25,
          'line-blur': 4
        }
      }, beforeId);

      // Main line layer for partner connections
      map.current.addLayer({
        id: 'collaboration-lines',
        type: 'line',
        source: COLLABORATION_SOURCE_ID,
        filter: ['all',
          ['==', ['geometry-type'], 'LineString'],
          ['==', ['get', 'lineType'], 'partner']
        ],
        paint: {
          'line-color': [
            'case',
            ['==', ['get', 'status'], 'active'], '#10B981',
            ['==', ['get', 'status'], 'pending'], '#F59E0B',
            '#6B7280'
          ],
          'line-width': [
            'case',
            ['==', ['get', 'status'], 'active'], 4,
            3
          ],
          'line-opacity': 0.85
        }
      }, beforeId);

      // Dashed overlay for pending collaborations
      map.current.addLayer({
        id: 'collaboration-lines-pending',
        type: 'line',
        source: COLLABORATION_SOURCE_ID,
        filter: ['all',
          ['==', ['geometry-type'], 'LineString'],
          ['==', ['get', 'lineType'], 'partner'],
          ['==', ['get', 'status'], 'pending']
        ],
        paint: {
          'line-color': '#F59E0B',
          'line-width': 3,
          'line-opacity': 0.9,
          'line-dasharray': [4, 3]
        }
      }, beforeId);

      // Overlap line layer
      map.current.addLayer({
        id: 'collaboration-lines-overlap',
        type: 'line',
        source: COLLABORATION_SOURCE_ID,
        filter: ['all',
          ['==', ['geometry-type'], 'LineString'],
          ['==', ['get', 'lineType'], 'overlap']
        ],
        paint: {
          'line-color': '#8B5CF6',
          'line-width': 3,
          'line-opacity': 0.7,
          'line-dasharray': [2, 2]
        }
      }, beforeId);

      // Overlap centroid markers
      map.current.addLayer({
        id: 'collaboration-overlap-points',
        type: 'circle',
        source: COLLABORATION_SOURCE_ID,
        filter: ['all',
          ['==', ['geometry-type'], 'Point'],
          ['==', ['get', 'featureType'], 'overlap-point']
        ],
        paint: {
          'circle-radius': 10,
          'circle-color': '#8B5CF6',
          'circle-opacity': 0.9,
          'circle-stroke-width': 3,
          'circle-stroke-color': '#fff'
        }
      }, beforeId);
    };

    const mapInstance = map.current;

    if (mapInstance.isStyleLoaded()) {
      renderCollaborationLines();
    } else {
      mapInstance.once('idle', renderCollaborationLines);
    }

    return () => {
      if (map.current) {
        try {
          for (const layerId of COLLABORATION_LAYERS) {
            if (map.current.getLayer(layerId)) {
              map.current.removeLayer(layerId);
            }
          }
          if (map.current.getSource(COLLABORATION_SOURCE_ID)) {
            map.current.removeSource(COLLABORATION_SOURCE_ID);
          }
        } catch (e) {
          // Layers may already be removed
        }
      }
    };
  }, [collaborationLines]);

  return null;
}
