import { useEffect } from "react";
import type mapboxgl from "mapbox-gl";
import type { ChurchWithCallings, Area, MinistryAreaWithCalling } from "@shared/schema";
import { MAP_AREA_COLORS } from "@shared/schema";

interface AreaLayerProps {
  map: React.MutableRefObject<mapboxgl.Map | null>;
  churches: ChurchWithCallings[];
  globalAreas: Area[];
  churchAreas: Area[];
  ministryAreas: MinistryAreaWithCalling[];
  visibleGlobalAreaIds: Set<string>;
  visibleChurchAreaIds: Set<string>;
  showAllAreas: boolean;
  mapOverlayMode: 'saturation' | 'boundaries' | 'off';
  mapOverlayModeRef: React.MutableRefObject<'saturation' | 'boundaries' | 'off'>;
  onMinistryAreaClick?: (churchId: string, areaId?: string) => void;
  applyAreaHighlight: (m: mapboxgl.Map) => void;
}

export function AreaLayer({
  map,
  churches,
  globalAreas,
  churchAreas,
  ministryAreas,
  visibleGlobalAreaIds,
  visibleChurchAreaIds,
  showAllAreas,
  mapOverlayMode,
  mapOverlayModeRef,
  onMinistryAreaClick,
  applyAreaHighlight,
}: AreaLayerProps) {
  useEffect(() => {
    if (!map.current) return;

    // Build church id -> calling color map (only needed when NOT in show all mode)
    const churchCallingColors: Record<string, string> = {};
    if (!showAllAreas) {
      churches.forEach(church => {
        if (church.callings && church.callings.length > 0) {
          const primaryCalling = church.callings[0];
          churchCallingColors[church.id] = primaryCalling.color || MAP_AREA_COLORS.defaultCalling;
        }
      });
    }

    // Filter visible areas from both contexts
    const visibleGlobal = globalAreas.filter(a => visibleGlobalAreaIds?.has(a.id));
    const visibleChurch = (showAllAreas || mapOverlayMode === 'boundaries')
      ? (ministryAreas || [])
      : (churchAreas || []).filter(a => visibleChurchAreaIds?.has(a.id));
    const allVisibleAreas = [...visibleGlobal, ...visibleChurch];

    const renderAreas = () => {
      if (!map.current || !map.current.isStyleLoaded()) return;

      const featureCollection = {
        type: 'FeatureCollection' as const,
        features: allVisibleAreas.map((area) => {
          const isPrimary = 'is_primary' in area ? area.is_primary : false;
          const callingColor = isPrimary
            ? MAP_AREA_COLORS.primaryMinistryArea
            : ('calling_color' in area
              ? area.calling_color
              : (area.church_id ? (churchCallingColors[area.church_id] || MAP_AREA_COLORS.defaultCalling) : null));

          return {
            type: 'Feature' as const,
            id: area.id,
            properties: {
              id: area.id,
              name: area.name,
              type: area.type,
              church_id: area.church_id,
              church_name: 'church_name' in area ? area.church_name : null,
              calling_color: callingColor,
              is_primary: isPrimary,
              population: 'population' in area ? area.population : null,
            },
            geometry: area.geometry,
          };
        }),
      };

      if (map.current.getSource('areas')) {
        const source = map.current.getSource('areas') as mapboxgl.GeoJSONSource;
        source.setData(featureCollection as any);
        applyAreaHighlight(map.current);
        return;
      }

      if (allVisibleAreas.length === 0) return;

      map.current.addSource('areas', {
        type: 'geojson',
        data: featureCollection as any,
      });

      const areasBeforeId = map.current.getLayer('ministry-saturation-fill')
        ? 'ministry-saturation-fill'
        : undefined;

      map.current.addLayer({
        id: 'areas-fill',
        type: 'fill',
        source: 'areas',
        paint: {
          'fill-color': [
            'case',
            ['==', ['get', 'is_primary'], true],
            MAP_AREA_COLORS.primaryMinistryArea,
            ['!=', ['get', 'church_id'], null],
            ['coalesce', ['get', 'calling_color'], MAP_AREA_COLORS.defaultCalling],
            MAP_AREA_COLORS.globalArea
          ],
          'fill-opacity': [
            'case',
            ['==', ['get', 'is_primary'], true],
            mapOverlayModeRef.current === 'boundaries' ? 0.3 : 0,
            mapOverlayModeRef.current === 'boundaries' ? 0.15 : 0
          ],
        },
      }, areasBeforeId);

      map.current.addLayer({
        id: 'areas-outline',
        type: 'line',
        source: 'areas',
        paint: {
          'line-color': [
            'case',
            ['==', ['get', 'is_primary'], true],
            MAP_AREA_COLORS.primaryMinistryArea,
            ['!=', ['get', 'church_id'], null],
            ['coalesce', ['get', 'calling_color'], MAP_AREA_COLORS.defaultCallingOutline],
            MAP_AREA_COLORS.globalAreaOutline
          ],
          'line-width': [
            'case',
            ['==', ['get', 'is_primary'], true],
            3,
            2
          ],
        },
      }, areasBeforeId);

      // Click handler for ministry areas (desktop only)
      map.current.on('click', 'areas-fill', (e) => {
        if (e.originalEvent instanceof TouchEvent) return;
        if (e.features && e.features.length > 0) {
          const churchId = e.features[0].properties?.church_id;
          const areaId = e.features[0].properties?.id;
          if (churchId && onMinistryAreaClick) {
            onMinistryAreaClick(churchId, areaId);
          }
        }
      });

      // Cursor change on hover
      map.current.on('mouseenter', 'areas-fill', () => {
        if (map.current) map.current.getCanvas().style.cursor = 'pointer';
      });
      map.current.on('mouseleave', 'areas-fill', () => {
        if (map.current) map.current.getCanvas().style.cursor = '';
      });

      applyAreaHighlight(map.current);
    };

    const mapInstance = map.current;
    let didRender = false;

    if (mapInstance.isStyleLoaded()) {
      renderAreas();
      didRender = true;
    } else {
      mapInstance.once('load', () => {
        renderAreas();
        didRender = true;
      });
    }

    const handleIdle = () => {
      if (!didRender && mapInstance.isStyleLoaded()) {
        renderAreas();
      }
    };
    mapInstance.once('idle', handleIdle);

    return () => {
      if (mapInstance) {
        mapInstance.off('load', renderAreas);
        mapInstance.off('idle', handleIdle);
      }
    };
  }, [globalAreas, churchAreas, ministryAreas, visibleGlobalAreaIds, visibleChurchAreaIds, showAllAreas, mapOverlayMode]);

  return null;
}
