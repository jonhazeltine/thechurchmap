import type { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { fetchTractsByBbox, fetchTractsForCounty, FetchTractsByBboxOptions } from '../../../../server/services/tigerweb';
import { fetchCDCPlacesDataForTracts, getMetricMeasureId } from '../../../../server/services/cdc-places';
import { fetchCensusACSDataForTracts, isCensusMetric } from '../../../../server/services/census-acs';
import { normalizeCrimeValue, isCrimeMetric } from '../../../../shared/metric-thresholds';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Crime metrics that use rolling windows (subset of all crime metrics that have rolling window data)
const ROLLING_WINDOW_METRICS = ['assault_rate', 'theft_rate', 'robbery_rate', 'burglary_rate', 'vehicle_theft_rate'];

// Valid data_period values for validation
const VALID_DATA_PERIODS = ['12mo_rolling', '36mo_rolling', 'Total'];

export async function GET(req: Request, res: Response) {
  try {
    const { bbox, state_fips, county_fips, metric_key, with_geometry, data_period, platform_id } = req.query;

    // Validate data_period if provided
    if (data_period && !VALID_DATA_PERIODS.includes(data_period as string)) {
      return res.status(400).json({ 
        error: `Invalid data_period. Valid values: ${VALID_DATA_PERIODS.join(', ')}` 
      });
    }

    if (bbox) {
      let [minLng, minLat, maxLng, maxLat] = (bbox as string).split(',').map(Number);
      
      if (isNaN(minLng) || isNaN(minLat) || isNaN(maxLng) || isNaN(maxLat)) {
        return res.status(400).json({ error: 'Invalid bbox format. Expected: minLng,minLat,maxLng,maxLat' });
      }

      // Track platform center for TIGERweb fallback (Census Geocoder)
      let platformCenter: { lng: number; lat: number } | undefined;

      // If platform_id is provided, constrain bbox to platform boundaries for performance
      // This prevents querying national data when we only need platform-specific data
      if (platform_id) {
        // First, try to get platform default center from city_platforms table
        const { data: platformData } = await supabase
          .from('city_platforms')
          .select('default_center_lng, default_center_lat')
          .eq('id', platform_id)
          .single();
        
        if (platformData?.default_center_lng && platformData?.default_center_lat) {
          platformCenter = {
            lng: platformData.default_center_lng,
            lat: platformData.default_center_lat
          };
          console.log(`[Health Tracts] Platform ${platform_id} center: (${platformCenter.lng}, ${platformCenter.lat})`);
        }

        // Get boundary IDs for the platform
        const { data: boundaryLinks } = await supabase
          .from('city_platform_boundaries')
          .select('boundary_id')
          .eq('city_platform_id', platform_id);
        
        if (boundaryLinks && boundaryLinks.length > 0) {
          const boundaryIds = boundaryLinks.map(b => b.boundary_id);
          
          // Use RPC function to get boundaries with proper GeoJSON geometry conversion
          const { data: platformBoundaries, error: boundaryError } = await supabase.rpc(
            'fn_get_boundaries_with_geometry',
            { ids_json: JSON.stringify(boundaryIds) }
          );
          
          if (boundaryError) {
            console.log(`[Health Tracts] Error fetching boundaries: ${boundaryError.message}`);
          }
          
          if (platformBoundaries && platformBoundaries.length > 0) {
            // Calculate platform bbox from boundaries to limit TIGERweb query
            let platformMinLng = Infinity, platformMinLat = Infinity;
            let platformMaxLng = -Infinity, platformMaxLat = -Infinity;
            
            for (const pb of platformBoundaries) {
              // Geometry is returned as GeoJSON from the RPC function
              const geometry = typeof pb.geometry === 'string' ? JSON.parse(pb.geometry) : pb.geometry;
              if (geometry?.coordinates) {
                const processCoords = (coords: any) => {
                  if (typeof coords[0] === 'number') {
                    platformMinLng = Math.min(platformMinLng, coords[0]);
                    platformMaxLng = Math.max(platformMaxLng, coords[0]);
                    platformMinLat = Math.min(platformMinLat, coords[1]);
                    platformMaxLat = Math.max(platformMaxLat, coords[1]);
                  } else {
                    coords.forEach(processCoords);
                  }
                };
                processCoords(geometry.coordinates);
              }
            }
            
            // Constrain the requested bbox to platform bounds
            if (platformMinLng !== Infinity) {
              minLng = Math.max(minLng, platformMinLng);
              minLat = Math.max(minLat, platformMinLat);
              maxLng = Math.min(maxLng, platformMaxLng);
              maxLat = Math.min(maxLat, platformMaxLat);
              console.log(`[Health Tracts] Platform ${platform_id}: constrained bbox to (${minLng},${minLat},${maxLng},${maxLat})`);
              
              // If we don't have platform center yet, calculate from constrained bbox
              if (!platformCenter) {
                platformCenter = {
                  lng: (platformMinLng + platformMaxLng) / 2,
                  lat: (platformMinLat + platformMaxLat) / 2
                };
                console.log(`[Health Tracts] Calculated platform center from boundaries: (${platformCenter.lng}, ${platformCenter.lat})`);
              }
            }
          } else {
            console.log(`[Health Tracts] No boundaries with geometry found for platform ${platform_id}`);
          }
        } else {
          console.log(`[Health Tracts] No boundary links found for platform ${platform_id}`);
        }
      }

      // First try to get tracts from TIGERweb
      const tracts = await fetchTractsByBbox(minLng, minLat, maxLng, maxLat, { platformCenter });
      
      let tractHealthData: Map<string, any> = new Map();
      let dataSource: string | null = null;
      
      if (metric_key && tracts.length > 0) {
        const metricKeyStr = metric_key as string;
        const tractFips = tracts.map(t => t.properties.GEOID);
        const tractFips11 = tractFips.map(fips => fips.substring(0, 11));
        
        // Determine data_period filter:
        // - Crime metrics: use rolling windows (default 12mo_rolling for heatmaps)
        // - Other metrics: use 'Total' or no filter
        const isRollingWindowMetric = ROLLING_WINDOW_METRICS.includes(metricKeyStr);
        const periodFilter = data_period 
          ? (data_period as string) 
          : (isRollingWindowMetric ? '12mo_rolling' : 'Total');
        
        // 1. First try database (using 11-digit FIPS codes which is how crime data is stored)
        let query = supabase
          .from('health_metric_data')
          .select(`
            geo_fips,
            estimate,
            lower_ci,
            upper_ci,
            data_period,
            source_name,
            metric:health_metrics!inner (metric_key, display_name, higher_is_better)
          `)
          .eq('metric.metric_key', metricKeyStr)
          .eq('geo_level', 'tract')
          .in('geo_fips', tractFips11)
          .eq('group_name', 'Total');
        
        // Apply period filter (always applies: crime=12mo_rolling, others=Total)
        query = query.eq('data_period', periodFilter);
        
        const { data: dbMetricData } = await query;
        
        if (dbMetricData && dbMetricData.length > 0) {
          // Map 11-digit FIPS back to full GEOID for rendering
          // Apply normalization for crime data that was ingested at inflated scale
          let normalizedCount = 0;
          dbMetricData.forEach(d => {
            const fullGeoid = tractFips.find(f => f.includes(d.geo_fips)) || d.geo_fips;
            const rawEstimate = d.estimate;
            const { value: normalizedEstimate, wasNormalized } = normalizeCrimeValue(rawEstimate, metricKeyStr);
            if (wasNormalized) normalizedCount++;
            tractHealthData.set(fullGeoid, { 
              ...d, 
              geo_fips: fullGeoid,
              estimate: normalizedEstimate,
              _rawEstimate: rawEstimate, // Keep original for debugging
            });
          });
          dataSource = dbMetricData[0]?.source_name || 'database';
          console.log(`Found ${tractHealthData.size} tracts from database for ${metricKeyStr}${normalizedCount > 0 ? ` (${normalizedCount} values normalized from inflated scale)` : ''}`);
        }

        // 2. Try CDC PLACES API if no database data
        if (tractHealthData.size === 0) {
          const measureId = getMetricMeasureId(metricKeyStr);
          
          if (measureId) {
            console.log(`Fetching CDC PLACES data for metric: ${measureId}`);
            const cdcData = await fetchCDCPlacesDataForTracts(measureId, tractFips11);
            
            if (cdcData.size > 0) {
              tractFips.forEach((fullFips, idx) => {
                const fips11 = tractFips11[idx];
                const record = cdcData.get(fips11);
                if (record) {
                  tractHealthData.set(fullFips, {
                    geo_fips: fullFips,
                    estimate: parseFloat(record.data_value) || null,
                    lower_ci: parseFloat(record.low_confidence_limit) || null,
                    upper_ci: parseFloat(record.high_confidence_limit) || null,
                    data_period: record.year,
                    measure: record.measure,
                    source: 'CDC PLACES'
                  });
                }
              });
              dataSource = 'CDC PLACES';
              console.log(`Matched ${tractHealthData.size}/${tractFips.length} tracts with CDC PLACES data`);
            }
          }
        }

        // 3. Try Census ACS API if no CDC data
        if (tractHealthData.size === 0 && isCensusMetric(metricKeyStr)) {
          console.log(`Fetching Census ACS data for metric: ${metricKeyStr}`);
          const censusData = await fetchCensusACSDataForTracts(metricKeyStr, tractFips);
          
          if (censusData.size > 0) {
            censusData.forEach((data, fips) => {
              tractHealthData.set(fips, {
                geo_fips: fips,
                estimate: data.values.estimate,
                data_period: '2019-2023',
                source: 'Census ACS'
              });
            });
            dataSource = 'Census ACS';
            console.log(`Matched ${tractHealthData.size}/${tractFips.length} tracts with Census ACS data`);
          }
        }

        // Log if no data found
        if (tractHealthData.size === 0) {
          console.log(`No data found for metric: ${metricKeyStr} from any source`);
        }
      }

      const features = tracts.map(tract => {
        const healthData = tractHealthData.get(tract.properties.GEOID);
        return {
          ...tract,
          properties: {
            ...tract.properties,
            ...(healthData || {}),
            dataSource: healthData?.source || dataSource
          }
        };
      });

      return res.json({
        type: 'FeatureCollection',
        features,
        metadata: {
          dataSource,
          tractCount: tracts.length,
          matchedCount: tractHealthData.size
        }
      });
    }

    if (state_fips && county_fips) {
      const tracts = await fetchTractsForCounty(state_fips as string, county_fips as string);
      return res.json({
        type: 'FeatureCollection',
        features: tracts
      });
    }

    return res.status(400).json({ 
      error: 'Either bbox or (state_fips + county_fips) is required' 
    });
  } catch (error) {
    console.error('Tracts GET error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function POST(req: Request, res: Response) {
  try {
    const { tracts } = req.body;

    if (!Array.isArray(tracts) || tracts.length === 0) {
      return res.status(400).json({ error: 'tracts array is required' });
    }

    const boundaries = tracts.map((tract: any) => ({
      external_id: tract.properties?.GEOID || tract.GEOID,
      name: tract.properties?.NAME || tract.NAME || tract.properties?.GEOID,
      type: 'tract',
      geometry: tract.geometry,
      source: 'TIGERweb'
    }));

    const { data, error } = await supabase
      .from('boundaries')
      .upsert(boundaries, { 
        onConflict: 'external_id,type',
        ignoreDuplicates: true 
      })
      .select();

    if (error) {
      console.error('Error caching tracts:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.json({ cached: data?.length || 0 });
  } catch (error) {
    console.error('Tracts POST error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
