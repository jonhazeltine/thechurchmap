import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import { buildPrayerTooltipHtml, buildSaturationTooltipHtml } from "./tooltipHelpers";

interface SaturationLayerProps {
  map: React.MutableRefObject<mapboxgl.Map | null>;
  mapOverlayMode: 'saturation' | 'boundaries' | 'off';
  mapOverlayModeRef: React.MutableRefObject<'saturation' | 'boundaries' | 'off'>;
  clippedSaturationGeoJSON: { type: 'FeatureCollection'; features: any[] } | null;
  saturationTooltipVisible: boolean;
  applyAreaHighlight: (m: mapboxgl.Map) => void;
}

export function SaturationLayer({
  map,
  mapOverlayMode,
  mapOverlayModeRef,
  clippedSaturationGeoJSON,
  saturationTooltipVisible,
  applyAreaHighlight,
}: SaturationLayerProps) {
  const saturationPopupRef = useRef<mapboxgl.Popup | null>(null);

  // Ministry saturation choropleth rendering
  useEffect(() => {
    if (!map.current) return;

    const findFirstLabelLayerIdSat = () => {
      if (!map.current) return undefined;
      const layers = map.current.getStyle()?.layers || [];
      for (const layer of layers) {
        if (layer.type === 'symbol' && (layer.id.includes('label') || layer.id.includes('place'))) {
          return layer.id;
        }
      }
      return undefined;
    };

    const ensureSatLayers = () => {
      if (!map.current) return false;
      if (map.current.getSource('ministry-saturation')) return true;

      try {
        const beforeId = findFirstLabelLayerIdSat();

        map.current.addSource('ministry-saturation', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });

        map.current.addLayer({
          id: 'ministry-saturation-fill',
          type: 'fill',
          source: 'ministry-saturation',
          paint: {
            'fill-color': [
              'interpolate', ['linear'], ['sqrt', ['max', ['coalesce', ['get', 'saturation'], 0], 0]],
              0, '#E0F2FE',
              0.15, '#BAE6FD',
              0.3, '#7DD3FC',
              0.5, '#38BDF8',
              0.7, '#0EA5E9',
              0.85, '#0284C7',
              1.0, '#0369A1',
              1.22, '#075985',
            ],
            'fill-opacity': [
              'case',
              ['==', ['coalesce', ['get', 'church_count'], 0], 0],
              0.08,
              ['interpolate', ['linear'], ['sqrt', ['max', ['coalesce', ['get', 'saturation'], 0], 0]],
                0, 0.2,
                0.15, 0.3,
                0.3, 0.4,
                0.5, 0.5,
                0.7, 0.6,
                1.0, 0.7,
              ],
            ],
          },
          layout: { visibility: 'none' },
        }, beforeId);

        map.current.addLayer({
          id: 'ministry-saturation-outline',
          type: 'line',
          source: 'ministry-saturation',
          paint: {
            'line-color': [
              'interpolate', ['linear'], ['coalesce', ['get', 'saturation'], 0],
              0, '#BAE6FD',
              0.5, '#38BDF8',
              1.0, '#0284C7',
              1.5, '#075985',
            ],
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              8, 0.5,
              12, 1,
              15, 1.5,
            ],
            'line-opacity': [
              'interpolate', ['linear'], ['coalesce', ['get', 'saturation'], 0],
              0, 0.4,
              0.3, 0.6,
              0.6, 0.75,
              1.0, 0.9,
            ],
          },
          layout: { visibility: 'none' },
        }, beforeId);

        return true;
      } catch (err) {
        console.error('Error initializing ministry saturation layers:', err);
        return false;
      }
    };

    const doUpdate = () => {
      if (!map.current) return;
      if (!ensureSatLayers()) return;

      const visibility = mapOverlayMode === 'saturation' ? 'visible' : 'none';
      ['ministry-saturation-fill', 'ministry-saturation-outline'].forEach(layerId => {
        if (map.current!.getLayer(layerId)) {
          map.current!.setLayoutProperty(layerId, 'visibility', visibility);
        }
      });

      applyAreaHighlight(map.current);
      if (map.current.getLayer('primary-area-fill')) {
        map.current.setPaintProperty('primary-area-fill', 'fill-opacity', mapOverlayMode === 'boundaries' ? 0.4 : 0);
      }

      if (mapOverlayMode !== 'saturation') return;

      const geojson = clippedSaturationGeoJSON || { type: 'FeatureCollection' as const, features: [] };
      const source = map.current.getSource('ministry-saturation') as mapboxgl.GeoJSONSource;
      if (source) source.setData(geojson as any);
    };

    if (map.current.isStyleLoaded()) {
      doUpdate();
    } else {
      const mapRef = map.current;
      const handleReady = () => {
        mapRef.off('idle', handleReady);
        mapRef.off('style.load', handleReady);
        doUpdate();
      };
      mapRef.once('idle', handleReady);
      mapRef.once('style.load', handleReady);
    }

    const mapRef2 = map.current;
    const handleStyleReset = () => {
      doUpdate();
    };
    mapRef2.on('style.load', handleStyleReset);

    return () => {
      mapRef2.off('style.load', handleStyleReset);
    };
  }, [mapOverlayMode, clippedSaturationGeoJSON]);

  // Ministry saturation hover: show public metrics on tract
  // Also handles area/prayer tooltips when saturation tooltip toggle is on
  useEffect(() => {
    if (!map.current || !saturationTooltipVisible) {
      if (saturationPopupRef.current) {
        saturationPopupRef.current.remove();
        saturationPopupRef.current = null;
      }
      return;
    }
    const m = map.current;

    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: 'saturation-hover-popup',
      anchor: 'bottom',
      offset: [0, -4],
    });
    saturationPopupRef.current = popup;

    const handleSaturationMouseMove = (e: mapboxgl.MapMouseEvent) => {
      if (mapOverlayModeRef.current !== 'saturation') return;
      if (!m.getLayer('ministry-saturation-fill')) return;
      const features = m.queryRenderedFeatures(e.point, { layers: ['ministry-saturation-fill'] });
      if (features.length > 0) {
        let html = `<div style="font-family:system-ui,sans-serif;font-size:13px;line-height:1.5;min-width:160px">`;
        html += buildSaturationTooltipHtml(features);

        const satPrayerLayers2: string[] = [];
        if (m.getLayer('prayer-coverage-fill')) satPrayerLayers2.push('prayer-coverage-fill');
        const satPrayerFeatures2 = satPrayerLayers2.length > 0 ? m.queryRenderedFeatures(e.point, { layers: satPrayerLayers2 }) : [];
        if (satPrayerFeatures2.length > 0) {
          html += '<div style="border-top:1px solid currentColor;opacity:0.15;margin:6px 0"></div>';
          html += buildPrayerTooltipHtml(satPrayerFeatures2);
        }

        html += `</div>`;

        m.getCanvas().style.cursor = 'pointer';
        popup.setLngLat(e.lngLat).setHTML(html).addTo(m);
        return;
      }

      const satPrayerLayers: string[] = [];
      if (m.getLayer('prayer-coverage-fill')) satPrayerLayers.push('prayer-coverage-fill');
      const satPrayerFeatures = satPrayerLayers.length > 0 ? m.queryRenderedFeatures(e.point, { layers: satPrayerLayers }) : [];
      if (satPrayerFeatures.length > 0) {
        let html = '<div style="font-family:system-ui,sans-serif;font-size:13px;line-height:1.5;min-width:160px">';
        html += buildPrayerTooltipHtml(satPrayerFeatures);
        html += '</div>';
        m.getCanvas().style.cursor = 'pointer';
        popup.setLngLat(e.lngLat).setHTML(html).addTo(m);
        return;
      }

      m.getCanvas().style.cursor = '';
      popup.remove();
    };

    const handleSaturationMouseLeave = () => {
      if (mapOverlayModeRef.current !== 'saturation') return;
      m.getCanvas().style.cursor = '';
      popup.remove();
    };

    const handleAreaMouseMove = (e: mapboxgl.MapMouseEvent) => {
      if (mapOverlayModeRef.current === 'saturation') return;

      const areaLayers: string[] = [];
      if (m.getLayer('areas-fill')) areaLayers.push('areas-fill');
      const prayerLayers: string[] = [];
      if (m.getLayer('prayer-coverage-fill')) prayerLayers.push('prayer-coverage-fill');

      const areaFeatures = areaLayers.length > 0 ? m.queryRenderedFeatures(e.point, { layers: areaLayers }) : [];
      const prayerFeatures = prayerLayers.length > 0 ? m.queryRenderedFeatures(e.point, { layers: prayerLayers }) : [];

      if (areaFeatures.length === 0 && prayerFeatures.length === 0) {
        m.getCanvas().style.cursor = '';
        popup.remove();
        return;
      }

      let html = '<div style="font-family:system-ui,sans-serif;font-size:13px;line-height:1.5;min-width:160px">';

      if (areaFeatures.length > 0) {
        const churchMap = new Map<string, { church_name: string; area_name: string; population: number }>();
        areaFeatures.forEach(f => {
          const props = f.properties;
          const churchName = props?.church_name || 'Unknown Church';
          const areaName = props?.name || 'Ministry Area';
          const pop = props?.population ? Number(props.population) : 0;
          const key = churchName;
          if (!churchMap.has(key)) {
            churchMap.set(key, {
              church_name: churchName,
              area_name: areaName,
              population: pop,
            });
          } else {
            const existing = churchMap.get(key)!;
            if (pop > existing.population) existing.population = pop;
          }
        });

        const uniqueChurches = Array.from(churchMap.values());

        if (uniqueChurches.length > 1) {
          html += '<div style="font-weight:600;margin-bottom:4px;color:#10b981">Collaboration Opportunity!</div>';
          html += `<div style="opacity:0.7">${uniqueChurches.length} churches serving this area</div>`;
          uniqueChurches.forEach(c => {
            html += `<div style="opacity:0.6;font-size:12px;padding-left:8px">&bull; ${c.church_name}</div>`;
            if (c.population > 0) {
              html += `<div style="opacity:0.45;font-size:11px;padding-left:16px">${c.population.toLocaleString()} people</div>`;
            }
          });
        } else if (uniqueChurches.length === 1) {
          const c = uniqueChurches[0];
          html += `<div style="font-weight:600;margin-bottom:4px">${c.church_name}</div>`;
          html += `<div style="opacity:0.6;font-size:12px">${c.area_name}</div>`;
          if (c.population > 0) {
            html += `<div style="opacity:0.7;font-size:12px;margin-top:2px">${c.population.toLocaleString()} people</div>`;
          }
        }
      }

      if (prayerFeatures.length > 0) {
        if (areaFeatures.length > 0) html += '<div style="border-top:1px solid currentColor;opacity:0.15;margin:6px 0"></div>';
        html += buildPrayerTooltipHtml(prayerFeatures);
      }

      html += '</div>';

      m.getCanvas().style.cursor = 'pointer';
      popup.setLngLat(e.lngLat).setHTML(html).addTo(m);
    };

    const handleGeneralMouseMove = (e: mapboxgl.MapMouseEvent) => {
      if (mapOverlayModeRef.current === 'saturation') {
        handleSaturationMouseMove(e);
      } else {
        handleAreaMouseMove(e);
      }
    };

    let lastMouseMoveTime = 0;
    const MOUSEMOVE_THROTTLE_MS = 50;

    const throttledMouseMove = (e: mapboxgl.MapMouseEvent) => {
      const now = Date.now();
      if (now - lastMouseMoveTime < MOUSEMOVE_THROTTLE_MS) return;
      lastMouseMoveTime = now;
      handleGeneralMouseMove(e);
    };

    m.on('mousemove', throttledMouseMove);
    if (m.getLayer('ministry-saturation-fill')) {
      m.on('mouseleave', 'ministry-saturation-fill', handleSaturationMouseLeave);
    }

    return () => {
      m.off('mousemove', throttledMouseMove);
      if (m.getLayer('ministry-saturation-fill')) {
        m.off('mouseleave', 'ministry-saturation-fill', handleSaturationMouseLeave);
      }
      popup.remove();
      saturationPopupRef.current = null;
    };
  }, [mapOverlayMode, saturationTooltipVisible]);

  return null;
}
