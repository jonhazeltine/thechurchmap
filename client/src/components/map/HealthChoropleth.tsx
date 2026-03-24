import { useEffect, useRef, useCallback } from "react";
import type mapboxgl from "mapbox-gl";
import {
  HEALTH_METRIC_COLOR_SCALES,
  isNegativeMetric,
} from "@shared/schema";
import { getChoroplethThresholds } from "@shared/metric-thresholds";

interface HealthChoroplethProps {
  map: React.MutableRefObject<mapboxgl.Map | null>;
  healthMetricKey: string | null;
  healthOverlayVisible: boolean;
  prayerCoverageVisible: boolean;
  platformId: string | null | undefined;
  onHealthDataLoadingChange?: (loading: boolean, metricKey?: string) => void;
}

export function HealthChoropleth({
  map,
  healthMetricKey,
  healthOverlayVisible,
  prayerCoverageVisible,
  platformId,
  onHealthDataLoadingChange,
}: HealthChoroplethProps) {
  // Health data choropleth overlay - refs for stable layer management
  // Cache includes platformId so switching metrics OR platforms triggers refetch
  const lastHealthFetchRef = useRef<{
    bbox: string;
    metric: string;
    platformId?: string | null;
  } | null>(null);
  const healthFetchAbortRef = useRef<AbortController | null>(null);
  const healthTractCacheRef = useRef<Map<string, any>>(new Map()); // Cache tracts by metric+geoid

  const platformIdRef = useRef(platformId);
  platformIdRef.current = platformId;

  const onHealthDataLoadingChangeRef = useRef(onHealthDataLoadingChange);
  onHealthDataLoadingChangeRef.current = onHealthDataLoadingChange;

  // Shared helper to enforce layer ordering: health overlay < boundaries < primary area < labels
  // This ensures the yellow primary ministry area is always visible on top of health choropleth
  const enforceOverlayOrder = useCallback(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    try {
      const hasPrimaryArea = !!map.current.getLayer('primary-area-fill');
      const hasHealthOverlay = !!map.current.getLayer('health-choropleth-fill');
      const hasBoundaries = !!map.current.getLayer('boundaries-fill');

      if (hasPrimaryArea && hasHealthOverlay) {
        // Move health overlay BELOW primary area
        map.current.moveLayer('health-choropleth-fill', 'primary-area-fill');
        if (map.current.getLayer('health-choropleth-outline')) {
          map.current.moveLayer('health-choropleth-outline', 'primary-area-fill');
        }
      }

      if (hasPrimaryArea && hasBoundaries) {
        // Move boundaries BELOW primary area
        map.current.moveLayer('boundaries-fill', 'primary-area-fill');
        if (map.current.getLayer('boundaries-outline')) {
          map.current.moveLayer('boundaries-outline', 'primary-area-fill');
        }
      }
    } catch (e) {
      // Layer ordering may fail if layers are being modified, that's ok
    }
  }, []);

  // Combined health overlay initialization and update
  useEffect(() => {
    if (!map.current) return;

    // Helper to find the first label layer to insert health overlay below labels
    const findFirstLabelLayerId = () => {
      if (!map.current) return undefined;
      const layers = map.current.getStyle()?.layers || [];
      for (const layer of layers) {
        if (layer.type === 'symbol' && (layer.id.includes('label') || layer.id.includes('place'))) {
          return layer.id;
        }
      }
      return undefined;
    };

    // Helper to ensure layers exist
    const ensureHealthLayers = () => {
      if (!map.current) return false;

      // Check if source already exists
      if (map.current.getSource('health-choropleth')) return true;

      try {
        // Find first label layer to insert overlay below it
        const firstLabelLayer = findFirstLabelLayerId();

        // If primary area exists, insert health layers BELOW it; otherwise below labels
        // This ensures primary area is always on top of health overlay
        const beforeId = map.current.getLayer('primary-area-fill') ? 'primary-area-fill' : firstLabelLayer;

        // Create empty source
        map.current.addSource('health-choropleth', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });

        // Add fill layer - insert below primary area or labels
        map.current.addLayer({
          id: 'health-choropleth-fill',
          type: 'fill',
          source: 'health-choropleth',
          paint: {
            'fill-color': ['coalesce', ['get', 'fillColor'], '#9CA3AF'],
            'fill-opacity': 0.55,
          },
          layout: { visibility: 'none' },
        }, beforeId);

        // Add outline layer - also below primary area or labels
        map.current.addLayer({
          id: 'health-choropleth-outline',
          type: 'line',
          source: 'health-choropleth',
          paint: {
            'line-color': 'rgba(100,100,100,0.5)',
            'line-width': 0.5,
          },
          layout: { visibility: 'none' },
        }, beforeId);

        console.log('Health choropleth layers initialized below:', beforeId);

        // Enforce order after creation
        enforceOverlayOrder();
        return true;
      } catch (err) {
        console.error('Error initializing health layers:', err);
        return false;
      }
    };

    const updateHealthData = async () => {
      if (!map.current) return;

      // Ensure layers are created
      if (!ensureHealthLayers()) {
        console.log('Waiting for map to be ready for health layers');
        return;
      }

      // Toggle visibility
      const visibility = healthMetricKey && healthOverlayVisible ? 'visible' : 'none';
      console.log('Setting health overlay visibility:', visibility, 'metric:', healthMetricKey);

      if (map.current.getLayer('health-choropleth-fill')) {
        map.current.setLayoutProperty('health-choropleth-fill', 'visibility', visibility);
      }
      if (map.current.getLayer('health-choropleth-outline')) {
        map.current.setLayoutProperty('health-choropleth-outline', 'visibility', visibility);
      }

      if (!healthMetricKey || !healthOverlayVisible) return;

      // Get current platform ID
      const currentPlatformId = platformIdRef.current;

      // Check cache - for platform views, we cache the entire platform's data
      // For national view, we don't cache since user may pan anywhere
      const cached = lastHealthFetchRef.current;
      if (cached?.metric === healthMetricKey && cached?.platformId === currentPlatformId) {
        // Already have data for this metric and platform - no fetch needed
        console.log('Using cached health data for metric:', healthMetricKey, 'platform:', currentPlatformId || 'national');
        return;
      }

      // Get viewport bounds as a starting point (API will expand to platform bounds if needed)
      const bounds = map.current.getBounds();
      if (!bounds) return;

      // Use a very large bbox when we have a platform - API will constrain to platform boundaries
      // This ensures we get ALL platform data regardless of current zoom/pan
      let bbox: string;
      if (currentPlatformId) {
        // For platform views: use huge bbox, let API constrain to platform boundaries
        // This loads ALL platform data at once for smooth zoom/pan
        bbox = '-180,-90,180,90';
      } else {
        // For national view: use current viewport with modest expansion
        const west = bounds.getWest();
        const south = bounds.getSouth();
        const east = bounds.getEast();
        const north = bounds.getNorth();
        const viewportWidth = east - west;
        const viewportHeight = north - south;
        bbox = `${(west - viewportWidth * 0.25).toFixed(4)},${(south - viewportHeight * 0.25).toFixed(4)},${(east + viewportWidth * 0.25).toFixed(4)},${(north + viewportHeight * 0.25).toFixed(4)}`;
      }

      // Abort previous request
      if (healthFetchAbortRef.current) {
        healthFetchAbortRef.current.abort();
      }
      healthFetchAbortRef.current = new AbortController();

      // Build query with optional platform_id to load entire platform's data
      const queryParams = new URLSearchParams({
        bbox,
        metric_key: healthMetricKey,
      });
      if (currentPlatformId) {
        queryParams.set('platform_id', currentPlatformId);
      }

      console.log('Fetching health tract data:', currentPlatformId ? `entire platform ${currentPlatformId}` : `viewport ${bbox}`);

      // Signal loading started
      onHealthDataLoadingChangeRef.current?.(true, healthMetricKey);

      try {
        const response = await fetch(
          `/api/health-data/tracts?${queryParams.toString()}`,
          { signal: healthFetchAbortRef.current.signal }
        );
        if (!response.ok) return;

        const tractData = await response.json();
        console.log('Got tract data with', tractData.features?.length, 'features');
        if (!tractData.features?.length) return;

        // Update cache - for platform views, this caches the entire platform's data
        lastHealthFetchRef.current = {
          bbox,
          metric: healthMetricKey,
          platformId: currentPlatformId
        };

        // Fixed thresholds matching prompts-for-area (calibrated to national averages)
        // Uses shared getChoroplethThresholds() for consistent classification with prayer prompts
        const thresholdConfig = getChoroplethThresholds(healthMetricKey);
        const isNegative = thresholdConfig?.direction === 'negative' || isNegativeMetric(healthMetricKey);

        // Color scales: [green, yellow-green, yellow, orange, red] for negative
        //               [red, orange, yellow, yellow-green, green] for positive
        const colorScale = isNegative
          ? HEALTH_METRIC_COLOR_SCALES.negative
          : HEALTH_METRIC_COLOR_SCALES.positive;

        // Get color based on fixed thresholds (matches prompts-for-area exactly)
        // Note: Crime data is now normalized at the API level (health-data/tracts route)
        const getColorForValue = (value: number): string => {
          // Use metric-specific thresholds if available
          if (thresholdConfig) {
            const [moderate, concerning, critical, veryCritical] = thresholdConfig.breakpoints;

            if (thresholdConfig.direction === 'negative') {
              // Negative: higher is worse (diseases, crime, poverty, etc.)
              if (value < moderate) return colorScale[0]; // green (low)
              if (value < concerning) return colorScale[1]; // yellow-green (moderate)
              if (value < critical) return colorScale[2]; // yellow (concerning)
              if (value < veryCritical) return colorScale[3]; // orange (critical)
              return colorScale[4]; // red (very critical)
            } else {
              // Positive: lower is worse (screenings, education, etc.)
              if (value > moderate) return colorScale[4]; // green (good)
              if (value > concerning) return colorScale[3]; // yellow-green (moderate)
              if (value > critical) return colorScale[2]; // yellow (concerning)
              if (value > veryCritical) return colorScale[1]; // orange (critical)
              return colorScale[0]; // red (very critical)
            }
          }

          // Fallback to generic thresholds for unconfigured metrics
          if (isNegative) {
            // Negative metrics: higher is worse
            if (value < 10) return colorScale[0]; // green (low)
            if (value < 20) return colorScale[1]; // yellow-green (moderate)
            if (value < 30) return colorScale[2]; // yellow (concerning)
            if (value < 40) return colorScale[3]; // orange (high)
            return colorScale[4]; // red (critical)
          } else {
            // Positive metrics: higher is better
            if (value >= 90) return colorScale[4]; // green
            if (value >= 80) return colorScale[3]; // yellow-green
            if (value >= 60) return colorScale[2]; // yellow
            if (value >= 40) return colorScale[1]; // orange
            return colorScale[0]; // red (critical)
          }
        };

        const featuresWithColor = tractData.features.map((feature: any) => {
          const value = feature.properties?.estimate;
          // Solid grey for missing data - clearly distinguishable from colored data
          let color = '#9CA3AF';

          // Only color if we have valid numeric data (not null, undefined, or sentinel values)
          if (value !== null && value !== undefined && !isNaN(value) && value !== -999) {
            color = getColorForValue(value);
          }

          return {
            ...feature,
            properties: { ...feature.properties, fillColor: color },
          };
        });

        // Update source data without removing layers
        const source = map.current.getSource('health-choropleth') as mapboxgl.GeoJSONSource;
        if (source) {
          source.setData({ type: 'FeatureCollection', features: featuresWithColor });
        }

        // Signal loading complete
        onHealthDataLoadingChangeRef.current?.(false, healthMetricKey);
      } catch (error: any) {
        // Signal loading complete (even on error)
        onHealthDataLoadingChangeRef.current?.(false, healthMetricKey);
        if (error.name !== 'AbortError') {
          console.error('Error fetching health data:', error);
        }
      }
    };

    // Debounced update on map move - 1200ms to reduce API calls during panning
    let moveTimeout: NodeJS.Timeout;
    const handleMoveEnd = () => {
      clearTimeout(moveTimeout);
      moveTimeout = setTimeout(updateHealthData, 1200);
    };

    // Run update when map is ready
    const runWhenReady = () => {
      if (map.current?.isStyleLoaded()) {
        updateHealthData();
      }
    };

    // Initial update - wait for map to be ready
    if (map.current.isStyleLoaded()) {
      updateHealthData();
    } else {
      map.current.once('load', runWhenReady);
    }

    // Listen for map moves
    map.current.on('moveend', handleMoveEnd);

    return () => {
      clearTimeout(moveTimeout);
      if (healthFetchAbortRef.current) {
        healthFetchAbortRef.current.abort();
      }
      if (map.current) {
        map.current.off('load', runWhenReady);
        map.current.off('moveend', handleMoveEnd);
      }
    };
  }, [healthMetricKey, healthOverlayVisible]);

  // Clear cache when metric or platform changes
  useEffect(() => {
    lastHealthFetchRef.current = null;
  }, [healthMetricKey, platformId]);

  // Adjust choropleth opacity when prayer coverage is active
  useEffect(() => {
    if (!map.current) return;
    const heatmapActive = !!(healthMetricKey && healthOverlayVisible);

    if (map.current.getLayer('health-choropleth-fill')) {
      const choroOpacity = (prayerCoverageVisible && heatmapActive) ? 0.25 : 0.55;
      map.current.setPaintProperty('health-choropleth-fill', 'fill-opacity', choroOpacity);
    }
  }, [healthMetricKey, healthOverlayVisible, prayerCoverageVisible]);

  return null;
}
