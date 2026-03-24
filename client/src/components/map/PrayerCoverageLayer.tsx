import { useEffect, useRef, useCallback } from "react";
import type mapboxgl from "mapbox-gl";

interface PrayerCoverageTract {
  tract_geoid: string;
  total_allocation_pct: number;
  effective_allocation_pct?: number;
  church_count: number;
  population: number;
  coverage_pct?: number;
  effective_coverage_pct?: number;
}

interface PrayerCoverageLayerProps {
  map: React.MutableRefObject<mapboxgl.Map | null>;
  prayerCoverageVisible: boolean;
  prayerCoverageMode: "citywide" | "myChurch";
  prayerCoverageData: { tracts: PrayerCoverageTract[] } | null;
}

export function PrayerCoverageLayer({
  map,
  prayerCoverageVisible,
  prayerCoverageMode,
  prayerCoverageData,
}: PrayerCoverageLayerProps) {
  // Prayer coverage overlay layer — stabilized to prevent flicker during zoom
  const prayerFetchAbortRef = useRef<AbortController | null>(null);
  const lastPrayerFetchRef = useRef<{ geoids: string } | null>(null);
  const cachedTractGeometriesRef = useRef<Map<string, any>>(new Map());

  const computeCoverageFeatures = useCallback((
    tracts: PrayerCoverageTract[],
    geometryCache: Map<string, any>,
    mode: string,
  ) => {
    const coverageMap = new Map(tracts.map(t => [t.tract_geoid, t]));
    const features: any[] = [];

    const entries = Array.from(geometryCache.entries());
    for (let i = 0; i < entries.length; i++) {
      const [geoid, geometry] = entries[i];
      const coverage = coverageMap.get(geoid);
      if (!coverage) continue;
      const pct = coverage.total_allocation_pct ?? 0;
      const effectivePct = coverage.effective_coverage_pct ?? coverage.coverage_pct ?? 0;
      const coverageRatio = Math.min(effectivePct / 100, 1.5);
      const density_bucket = coverageRatio < 0.25 ? 1 : coverageRatio < 0.5 ? 2 : coverageRatio < 0.85 ? 3 : 4;
      features.push({
        ...geometry,
        properties: {
          ...geometry.properties,
          coverage_ratio: coverageRatio,
          allocation_pct: pct,
          coverage_pct: coverage.coverage_pct ?? 0,
          effective_coverage_pct: effectivePct,
          church_count: coverage.church_count ?? 0,
          density_bucket,
        },
      });
    }
    return features;
  }, []);

  useEffect(() => {
    if (!map.current) return;

    const ensurePrayerLayers = () => {
      if (!map.current) return false;
      if (map.current.getSource('prayer-coverage') && map.current.getLayer('prayer-coverage-fill')) return true;

      try {
        const layers = map.current.getStyle()?.layers || [];
        let beforeId: string | undefined;
        for (const layer of layers) {
          if (layer.type === 'symbol' && (layer.id.includes('label') || layer.id.includes('place'))) {
            beforeId = layer.id;
            break;
          }
        }

        if (!map.current.getSource('prayer-coverage')) {
          map.current.addSource('prayer-coverage', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });
        }

        map.current.addLayer({
          id: 'prayer-coverage-fill',
          type: 'fill',
          source: 'prayer-coverage',
          paint: {
            'fill-color': [
              'interpolate', ['linear'], ['coalesce', ['get', 'coverage_ratio'], 0],
              0, '#FEF9C3',
              0.2, '#FDE68A',
              0.5, '#FBBF24',
              0.8, '#F59E0B',
              1.0, '#D97706',
              1.5, '#B45309',
            ],
            'fill-opacity': [
              'case',
              ['==', ['coalesce', ['get', 'church_count'], 0], 0],
              0.08,
              ['interpolate', ['linear'], ['coalesce', ['get', 'coverage_ratio'], 0],
                0, 0.25,
                0.15, 0.35,
                0.3, 0.45,
                0.6, 0.55,
                1.0, 0.65,
              ],
            ],
          },
          layout: { visibility: 'none' },
        }, beforeId);

        map.current.addLayer({
          id: 'prayer-coverage-outline',
          type: 'line',
          source: 'prayer-coverage',
          paint: {
            'line-color': [
              'interpolate', ['linear'], ['coalesce', ['get', 'coverage_ratio'], 0],
              0, '#FDE68A',
              0.5, '#FBBF24',
              1.0, '#D97706',
              1.5, '#92400E',
            ],
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              8, 0.5,
              12, 1,
              15, 1.5,
            ],
            'line-opacity': [
              'interpolate', ['linear'], ['coalesce', ['get', 'coverage_ratio'], 0],
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
        console.error('Error initializing prayer coverage layers:', err);
        return false;
      }
    };

    const updatePrayerCoverage = async () => {
      if (!map.current) return;
      if (!ensurePrayerLayers()) return;

      const showLayers = () => {
        ['prayer-coverage-fill', 'prayer-coverage-outline'].forEach(layerId => {
          if (map.current?.getLayer(layerId)) {
            map.current.setLayoutProperty(layerId, 'visibility', 'visible');
          }
        });
      };
      const hideLayers = () => {
        ['prayer-coverage-fill', 'prayer-coverage-outline'].forEach(layerId => {
          if (map.current?.getLayer(layerId)) {
            map.current.setLayoutProperty(layerId, 'visibility', 'none');
          }
        });
      };

      if (!prayerCoverageVisible) {
        hideLayers();
        lastPrayerFetchRef.current = null;
        return;
      }

      if (!prayerCoverageData?.tracts?.length) {
        if (!prayerCoverageData || prayerCoverageData.tracts.length === 0) {
          const source = map.current.getSource('prayer-coverage') as mapboxgl.GeoJSONSource;
          if (source) source.setData({ type: 'FeatureCollection', features: [] });
          hideLayers();
          lastPrayerFetchRef.current = null;
          cachedTractGeometriesRef.current.clear();
        }
        return;
      }

      const geoids = prayerCoverageData.tracts.map(t => t.tract_geoid);
      const geoidKey = [...geoids].sort().join(',');

      const missingGeoids = geoids.filter(g => !cachedTractGeometriesRef.current.has(g));

      if (missingGeoids.length === 0) {
        const features = computeCoverageFeatures(
          prayerCoverageData.tracts, cachedTractGeometriesRef.current, prayerCoverageMode
        );
        const source = map.current.getSource('prayer-coverage') as mapboxgl.GeoJSONSource;
        if (source) source.setData({ type: 'FeatureCollection', features });
        showLayers();
        lastPrayerFetchRef.current = { geoids: geoidKey };
        return;
      }

      if (cachedTractGeometriesRef.current.size > 0) {
        const features = computeCoverageFeatures(
          prayerCoverageData.tracts, cachedTractGeometriesRef.current, prayerCoverageMode
        );
        const source = map.current.getSource('prayer-coverage') as mapboxgl.GeoJSONSource;
        if (source && features.length > 0) {
          source.setData({ type: 'FeatureCollection', features });
          showLayers();
        }
      }

      if (prayerFetchAbortRef.current) prayerFetchAbortRef.current.abort();
      prayerFetchAbortRef.current = new AbortController();

      try {
        const response = await fetch(
          `/api/tracts/geometries?geoids=${missingGeoids.join(',')}`,
          { signal: prayerFetchAbortRef.current.signal }
        );
        if (!response.ok) return;

        const geojson = await response.json();

        for (const feature of geojson.features) {
          const geoid = feature.properties?.geoid;
          if (geoid) cachedTractGeometriesRef.current.set(geoid, feature);
        }

        lastPrayerFetchRef.current = { geoids: geoidKey };

        if (!map.current) return;
        const features = computeCoverageFeatures(
          prayerCoverageData.tracts, cachedTractGeometriesRef.current, prayerCoverageMode
        );
        const source = map.current.getSource('prayer-coverage') as mapboxgl.GeoJSONSource;
        if (source) {
          source.setData({ type: 'FeatureCollection', features });
          showLayers();
        }
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.error('Error fetching prayer coverage geometries:', error);
        }
      }
    };

    if (map.current.isStyleLoaded()) {
      updatePrayerCoverage();
    } else {
      map.current.once('load', updatePrayerCoverage);
    }

    const mapRef3 = map.current;
    const handlePrayerStyleReset = () => {
      updatePrayerCoverage();
    };
    mapRef3.on('style.load', handlePrayerStyleReset);

    return () => {
      if (prayerFetchAbortRef.current) prayerFetchAbortRef.current.abort();
      mapRef3.off('style.load', handlePrayerStyleReset);
    };
  }, [prayerCoverageVisible, prayerCoverageData, prayerCoverageMode, computeCoverageFeatures]);

  return null;
}
