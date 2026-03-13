import type { Request, Response } from 'express';
import { supabaseServer } from '../../../../lib/supabaseServer';
import { fetchTractsByBbox } from '../../../../server/services/tigerweb';
import { fetchCDCPlacesDataForTracts, getMetricMeasureId } from '../../../../server/services/cdc-places';
import { fetchCensusACSDataForTracts, isCensusMetric } from '../../../../server/services/census-acs';
import { HEALTH_METRIC_KEYS, COLLAB_OPTIONS, isNegativeMetric } from '../../../../shared/schema';
import { 
  getSeverityLevel, 
  normalizeCrimeValue, 
  CRIME_METRIC_KEYS 
} from '../../../../shared/metric-thresholds';
import wkx from 'wkx';
import * as turf from '@turf/turf';

const CDC_CRITICAL_METRICS = [
  'food_insecurity',
  'housing_insecurity', 
  'social_isolation',
  'transportation_barriers',
  'lack_social_support',
  'utility_shutoff_threat',
  'health_insurance',
  'depression',
  'general_health',
  'obesity',
  'diabetes',
];

const CENSUS_CRITICAL_METRICS = [
  'poverty',
  'child_poverty',
  'unemployment',
  'uninsured',
];

// Public Safety metrics - uses shared CRIME_METRIC_KEYS from metric-thresholds.ts
// These are the metrics that are stored in Supabase from local police data
const PUBLIC_SAFETY_METRICS = CRIME_METRIC_KEYS;

// Uses shared getSeverityLevel from metric-thresholds.ts for consistency with Map Choropleth
// This ensures thresholds are defined in one place and used everywhere
function getMetricLevel(estimate: number, metricKey: string): 'low' | 'moderate' | 'concerning' | 'critical' {
  // Use shared threshold configuration
  const severity = getSeverityLevel(estimate, metricKey);
  
  // Map 'very_critical' to 'critical' for display simplicity
  if (severity === 'very_critical') return 'critical';
  return severity as 'low' | 'moderate' | 'concerning' | 'critical';
}

function getBboxFromGeometry(geometry: any): [number, number, number, number] {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  
  const processCoordinates = (coords: any) => {
    if (typeof coords[0] === 'number') {
      const [lng, lat] = coords;
      minLng = Math.min(minLng, lng);
      minLat = Math.min(minLat, lat);
      maxLng = Math.max(maxLng, lng);
      maxLat = Math.max(maxLat, lat);
    } else {
      for (const coord of coords) {
        processCoordinates(coord);
      }
    }
  };
  
  if (geometry.coordinates) {
    processCoordinates(geometry.coordinates);
  }
  
  return [minLng, minLat, maxLng, maxLat];
}

export async function GET(req: Request, res: Response) {
  try {
    const { churchId } = req.query;
    
    if (!churchId) {
      return res.status(400).json({ error: 'churchId is required' });
    }

    const supabase = supabaseServer();

    const { data: church, error: churchError } = await supabase
      .from('churches')
      .select(`
        id, name, primary_ministry_area, boundary_ids, 
        collaboration_have, collaboration_need
      `)
      .eq('id', churchId)
      .single();

    if (churchError || !church) {
      return res.status(404).json({ error: 'Church not found' });
    }

    const { data: churchCallingData } = await supabase
      .from('church_calling')
      .select('calling_id, callings!inner(id, name, type)')
      .eq('church_id', churchId);

    const churchCallings = (churchCallingData || []).map((cc: any) => cc.callings);

    // Get the platform this church belongs to (use any status, we just need the platform context)
    const { data: churchPlatformLink } = await supabase
      .from('city_platform_churches')
      .select('city_platform_id')
      .eq('church_id', churchId)
      .limit(1)
      .single();
    
    const platformId = churchPlatformLink?.city_platform_id;
    
    // Get platform display settings for LDS/JW filtering
    let displayLdsChurches = false;
    let displayJwChurches = false;
    
    if (platformId) {
      const { data: platformSettings } = await supabase
        .from('city_platforms')
        .select('display_lds_churches, display_jw_churches')
        .eq('id', platformId)
        .single();
      
      displayLdsChurches = platformSettings?.display_lds_churches ?? false;
      displayJwChurches = platformSettings?.display_jw_churches ?? false;
    }

    let areaPolygon: any = null;
    let areaSource: 'ministry_area' | 'boundary' | null = null;

    if (church.primary_ministry_area) {
      let parsedArea = church.primary_ministry_area;
      
      if (typeof parsedArea === 'string') {
        if (parsedArea.startsWith('01') && /^[0-9A-Fa-f]+$/.test(parsedArea)) {
          try {
            const wkbBuffer = Buffer.from(parsedArea, 'hex');
            const geometry = wkx.Geometry.parse(wkbBuffer);
            parsedArea = geometry.toGeoJSON();
          } catch (e) {
            console.error('Failed to parse WKB primary_ministry_area:', e);
          }
        } else {
          try {
            parsedArea = JSON.parse(parsedArea);
          } catch (e) {
            console.error('Failed to parse JSON primary_ministry_area:', e);
          }
        }
      }
      
      if (parsedArea && parsedArea.coordinates) {
        areaPolygon = parsedArea;
        areaSource = 'ministry_area';
      }
    } else if (church.boundary_ids && church.boundary_ids.length > 0) {
      const { data: boundary } = await supabase
        .from('boundaries')
        .select('geometry')
        .eq('id', church.boundary_ids[0])
        .single();
      
      if (boundary?.geometry) {
        areaPolygon = boundary.geometry;
        areaSource = 'boundary';
      }
    }

    if (!areaPolygon || !areaPolygon.coordinates) {
      return res.json({
        hasArea: false,
        message: 'No ministry area or boundary defined for this church',
        partners: [],
        criticalNeeds: [],
        collaborationOpportunities: []
      });
    }

    const polygonGeoJSON = JSON.stringify(areaPolygon);

    const { data: partnersRaw, error: partnersError } = await supabase.rpc('fn_churches_in_polygon', {
      polygon_geojson: polygonGeoJSON
    });

    if (partnersError) {
      console.error('Error fetching partners:', partnersError);
    }

    // Get raw partner IDs (excluding self)
    const rawPartnerIds = (partnersRaw || [])
      .filter((p: any) => p.id !== church.id)
      .map((p: any) => p.id);
    
    // Filter to only visible/featured churches on this platform
    // If no platform context, default to empty set (no partners) for safety
    let visiblePartnerIds: Set<string> = new Set();
    
    if (platformId && rawPartnerIds.length > 0) {
      const { data: visibleLinks } = await supabase
        .from('city_platform_churches')
        .select('church_id')
        .eq('city_platform_id', platformId)
        .in('status', ['visible', 'featured'])
        .in('church_id', rawPartnerIds);
      
      if (visibleLinks) {
        visiblePartnerIds = new Set(visibleLinks.map((l: any) => l.church_id));
      }
    }
    
    // Apply visibility and LDS/JW filtering
    let partners = (partnersRaw || [])
      .filter((p: any) => p.id !== church.id)
      .filter((p: any) => visiblePartnerIds.has(p.id))
      .filter((p: any) => {
        // Apply LDS filtering if platform hides LDS churches
        if (!displayLdsChurches && p.denomination?.toLowerCase().includes('latter-day')) {
          return false;
        }
        // Apply JW filtering if platform hides JW churches
        if (!displayJwChurches && p.denomination?.toLowerCase().includes('jehovah')) {
          return false;
        }
        return true;
      })
      .map((p: any) => ({
        id: p.id,
        name: p.name,
        city: p.city,
        profile_photo_url: p.profile_photo_url,
        collaboration_have: (p.collaboration_have || []).map(String),
        collaboration_need: (p.collaboration_need || []).map(String)
      }));

    const partnerIds = partners.map((p: any) => p.id);
    let partnerCallings: Record<string, any[]> = {};
    
    if (partnerIds.length > 0) {
      const { data: callingData } = await supabase
        .from('church_calling')
        .select('church_id, calling_id, callings!inner(id, name, type)')
        .in('church_id', partnerIds);
      
      if (callingData) {
        callingData.forEach((cc: any) => {
          if (!partnerCallings[cc.church_id]) {
            partnerCallings[cc.church_id] = [];
          }
          partnerCallings[cc.church_id].push(cc.callings);
        });
      }
    }

    partners = partners.map((p: any) => ({
      ...p,
      callings: partnerCallings[p.id] || []
    }));

    const totalPartners = partners.length;
    const partnersList = partners.slice(0, 20);

    // Use the exact bbox from the ministry area polygon - no expansion
    // This ensures we only query tracts that actually intersect with the ministry area
    const bbox = getBboxFromGeometry(areaPolygon);
    const [minLng, minLat, maxLng, maxLat] = bbox;
    
    console.log(`[Area Intelligence] Church: ${church.name}, bbox: ${minLng.toFixed(4)},${minLat.toFixed(4)},${maxLng.toFixed(4)},${maxLat.toFixed(4)}`);
    
    let criticalNeeds: any[] = [];
    
    if (isFinite(minLng) && isFinite(minLat) && isFinite(maxLng) && isFinite(maxLat)) {
      try {
        const allTracts = await fetchTractsByBbox(minLng, minLat, maxLng, maxLat);
        console.log(`[Area Intelligence] Found ${allTracts?.length || 0} tracts in bbox for ${church.name}`);
        
        // Filter tracts to only those that actually intersect the ministry area polygon
        // This prevents nearby high-value tracts from skewing the average
        const ministryAreaFeature = turf.feature(areaPolygon as GeoJSON.Polygon | GeoJSON.MultiPolygon);
        const tracts = allTracts.filter(tract => {
          if (!tract.geometry) return false;
          try {
            const tractFeature = turf.feature(tract.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon);
            return turf.booleanIntersects(ministryAreaFeature, tractFeature);
          } catch (e) {
            // If intersection check fails, include the tract to be safe
            return true;
          }
        });
        console.log(`[Area Intelligence] After intersection filter: ${tracts.length} tracts actually intersect ministry area`);
        
        if (tracts && tracts.length > 0) {
          const tractFips = tracts.map(t => t.properties?.GEOID).filter(Boolean);
          const tractFips11 = tractFips.map(fips => fips.substring(0, 11));
          
          if (tractFips.length > 0) {
            for (const metricKey of CDC_CRITICAL_METRICS) {
              const measureId = getMetricMeasureId(metricKey);
              if (!measureId) continue;
              
              try {
                const cdcData = await fetchCDCPlacesDataForTracts(measureId, tractFips11);
                if (cdcData.size === 0) continue;
                
                // Calculate population-weighted average
                let weightedSum = 0;
                let totalPopulation = 0;
                let tractCount = 0;
                
                cdcData.forEach((record) => {
                  const estimate = parseFloat(record.data_value);
                  const population = parseInt(record.totalpopulation) || 0;
                  
                  if (!isNaN(estimate) && population > 0) {
                    weightedSum += estimate * population;
                    totalPopulation += population;
                    tractCount++;
                  }
                });
                
                if (totalPopulation > 0 && tractCount > 0) {
                  const weightedAvg = weightedSum / totalPopulation;
                  const level = getMetricLevel(weightedAvg, metricKey);
                  console.log(`[Area Intelligence] CDC ${metricKey}: avg=${weightedAvg.toFixed(1)}, level=${level}`);
                  
                  if (level === 'concerning' || level === 'critical') {
                    const metricInfo = HEALTH_METRIC_KEYS[metricKey as keyof typeof HEALTH_METRIC_KEYS];
                    criticalNeeds.push({
                      metricKey,
                      displayName: metricInfo?.display || metricKey,
                      category: metricInfo?.category || 'unknown',
                      estimate: Math.round(weightedAvg * 10) / 10,
                      level,
                      dataSource: 'CDC PLACES',
                      tractCount,
                      totalPopulation
                    });
                  }
                }
              } catch (e) {
                console.error(`Error fetching CDC data for ${metricKey}:`, e);
              }
            }

            for (const metricKey of CENSUS_CRITICAL_METRICS) {
              if (!isCensusMetric(metricKey)) continue;
              
              try {
                const censusData = await fetchCensusACSDataForTracts(metricKey, tractFips);
                if (censusData.size > 0) {
                  let total = 0;
                  let count = 0;
                  
                  censusData.forEach((data) => {
                    if (data.values?.estimate !== null && !isNaN(data.values?.estimate)) {
                      total += data.values.estimate;
                      count++;
                    }
                  });
                  
                  if (count > 0) {
                    const avgEstimate = total / count;
                    const level = getMetricLevel(avgEstimate, metricKey);
                    console.log(`[Area Intelligence] Census ${metricKey}: avg=${avgEstimate.toFixed(1)}, level=${level}`);
                    
                    if (level === 'concerning' || level === 'critical') {
                      const metricInfo = HEALTH_METRIC_KEYS[metricKey as keyof typeof HEALTH_METRIC_KEYS];
                      criticalNeeds.push({
                        metricKey,
                        displayName: metricInfo?.display || metricKey,
                        category: metricInfo?.category || 'unknown',
                        estimate: Math.round(avgEstimate * 10) / 10,
                        level,
                        dataSource: 'Census ACS',
                        tractCount: count
                      });
                    }
                  }
                }
              } catch (e) {
                console.error(`Error fetching Census data for ${metricKey}:`, e);
              }
            }

            // Fetch Public Safety (crime) data from Supabase
            try {
              const { data: crimeMetrics } = await supabase
                .from('health_metrics')
                .select('id, metric_key')
                .in('metric_key', PUBLIC_SAFETY_METRICS);

              if (crimeMetrics && crimeMetrics.length > 0) {
                const metricIds = crimeMetrics.map(m => m.id);
                
                const { data: crimeData } = await supabase
                  .from('health_metric_data')
                  .select('metric_id, geo_fips, estimate, denominator')
                  .in('metric_id', metricIds)
                  .in('geo_fips', tractFips)
                  .eq('data_period', '12mo_rolling')
                  .not('estimate', 'is', null);

                if (crimeData && crimeData.length > 0) {
                  // Group by metric and calculate weighted average
                  // IMPORTANT: Normalize each tract's value BEFORE aggregation (same as choropleth)
                  const metricIdToKey = new Map(crimeMetrics.map(m => [m.id, m.metric_key]));
                  const metricAggregates = new Map<string, { sum: number; totalPop: number; count: number; normalizedCount: number }>();

                  for (const row of crimeData) {
                    const metricKey = metricIdToKey.get(row.metric_id);
                    if (!metricKey) continue;

                    const rawEstimate = row.estimate;
                    const population = row.denominator || 0;
                    
                    if (rawEstimate !== null && population > 0) {
                      // Normalize individual tract values BEFORE aggregation (matches choropleth behavior)
                      const { value: normalizedEstimate, wasNormalized } = normalizeCrimeValue(rawEstimate, metricKey);
                      
                      const agg = metricAggregates.get(metricKey) || { sum: 0, totalPop: 0, count: 0, normalizedCount: 0 };
                      agg.sum += normalizedEstimate * population;
                      agg.totalPop += population;
                      agg.count++;
                      if (wasNormalized) agg.normalizedCount++;
                      metricAggregates.set(metricKey, agg);
                    }
                  }

                  Array.from(metricAggregates.entries()).forEach(([metricKey, agg]) => {
                    if (agg.totalPop > 0) {
                      const weightedAvg = agg.sum / agg.totalPop;
                      const level = getMetricLevel(weightedAvg, metricKey);
                      console.log(`[Area Intelligence] Crime ${metricKey}: avg=${weightedAvg.toFixed(1)}, level=${level}${agg.normalizedCount > 0 ? ` (${agg.normalizedCount}/${agg.count} tracts normalized)` : ''}`);

                      if (level === 'concerning' || level === 'critical') {
                        const metricInfo = HEALTH_METRIC_KEYS[metricKey as keyof typeof HEALTH_METRIC_KEYS];
                        criticalNeeds.push({
                          metricKey,
                          displayName: metricInfo?.display || metricKey,
                          category: 'public_safety',
                          estimate: Math.round(weightedAvg * 10) / 10,
                          level,
                          dataSource: 'Local Police Departments',
                          tractCount: agg.count,
                          totalPopulation: agg.totalPop
                        });
                      }
                    }
                  });
                }
              }
            } catch (e) {
              console.error('Error fetching crime data:', e);
            }
            
            criticalNeeds.sort((a, b) => {
              if (a.level === 'critical' && b.level !== 'critical') return -1;
              if (a.level !== 'critical' && b.level === 'critical') return 1;
              return b.estimate - a.estimate;
            });
          }
        }
      } catch (error) {
        console.error('Error fetching health metrics:', error);
      }
    }

    const churchCollabHave: string[] = (church.collaboration_have || []).map(String);
    const churchCollabNeed: string[] = (church.collaboration_need || []).map(String);

    let collaborationOpportunities: any[] = [];
    
    for (const partner of partnersList) {
      const partnerCallingsList = partner.callings || [];
      const sharedCallings = churchCallings.filter((cc: any) => 
        partnerCallingsList.some((pc: any) => pc.id === cc.id)
      );
      
      const collabMatches: string[] = [];
      const partnerHave: string[] = (partner.collaboration_have || []).map(String);
      const partnerNeed: string[] = (partner.collaboration_need || []).map(String);
      
      for (const have of partnerHave) {
        if (churchCollabNeed.includes(have)) {
          const option = COLLAB_OPTIONS.find(o => o.value === have);
          collabMatches.push(`They have: ${option?.label || have}`);
        }
      }
      
      for (const need of partnerNeed) {
        if (churchCollabHave.includes(need)) {
          const option = COLLAB_OPTIONS.find(o => o.value === need);
          collabMatches.push(`They need: ${option?.label || need}`);
        }
      }
      
      if (sharedCallings.length > 0 || collabMatches.length > 0) {
        collaborationOpportunities.push({
          church: {
            id: partner.id,
            name: partner.name,
            city: partner.city,
            profile_photo_url: partner.profile_photo_url
          },
          sharedCallings: sharedCallings.map((c: any) => ({
            id: c.id,
            name: c.name,
            type: c.type
          })),
          collabMatches,
          matchScore: sharedCallings.length * 2 + collabMatches.length
        });
      }
    }

    collaborationOpportunities.sort((a, b) => b.matchScore - a.matchScore);

    return res.json({
      hasArea: true,
      areaSource,
      churchName: church.name,
      totalPartners,
      partners: partnersList,
      criticalNeeds,
      collaborationOpportunities,
      metadata: {
        churchCallings: churchCallings.length,
        churchCollabHave: churchCollabHave.length,
        churchCollabNeed: churchCollabNeed.length
      }
    });

  } catch (error: any) {
    console.error('Area Intelligence error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
