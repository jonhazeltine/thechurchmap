import type { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';
import { fetchTractsByBbox } from '../../../../server/services/tigerweb';
import { fetchCDCPlacesDataForTracts, getMetricMeasureId } from '../../../../server/services/cdc-places';
import { fetchCensusACSDataForTracts, isCensusMetric } from '../../../../server/services/census-acs';
import { HEALTH_METRIC_KEYS } from '../../../../shared/schema';
import { 
  getSeverityLevel, 
  getMetricCategory, 
  CATEGORY_LABELS,
  type MetricCategory 
} from '../../../../shared/metric-thresholds';
import type { PrayerPromptType, ResolvedPrayerPrompt, HealthSeverityLevel } from '../../../../shared/schema';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Simple hash function for location-based rotation
 * Returns a number between 0 and max-1
 * Uses 1 decimal precision (~10km) for stability while panning
 */
function hashLocation(lat: number, lng: number, max: number): number {
  const str = `${lat.toFixed(1)},${lng.toFixed(1)}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash) % max;
}

/**
 * Get the day of year (0-364) for daily rotation
 */
function getDayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

/**
 * Calculate rotation offset for community needs prompts
 * Combines location hash with daily rotation
 */
function getPromptRotationOffset(lat: number, lng: number, poolSize: number): number {
  const locationHash = hashLocation(lat, lng, poolSize);
  const dayOffset = getDayOfYear();
  return (locationHash + dayOffset) % poolSize;
}

interface MetricSummary {
  metric_key: string;
  display: string;
  category: MetricCategory | undefined;
  avg_value: number;
  severity: HealthSeverityLevel;
  tract_count: number;
}

/**
 * Select metrics with category diversity and session-based rotation
 * 
 * @param metrics - All metrics above concerning threshold
 * @param limit - Max metrics to return
 * @param seenMetrics - Metrics already shown in this session (to deprioritize)
 * 
 * Pass 1: Take the highest-severity UNSEEN metric from each category
 * Pass 2: If all unseen exhausted, take highest-severity SEEN metric from each category
 * Pass 3: Fill remaining slots by severity, preferring unseen
 */
function selectCategoryBalancedMetrics(
  metrics: MetricSummary[], 
  limit: number,
  seenMetrics: Set<string> = new Set()
): MetricSummary[] {
  // Sort by severity first
  const severityOrder = { 'very_critical': 0, 'critical': 1, 'concerning': 2, 'moderate': 3, 'low': 4 };
  const sorted = [...metrics].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  
  // Split into unseen and seen metrics (both still sorted by severity)
  const unseenMetrics = sorted.filter(m => !seenMetrics.has(m.metric_key));
  const previouslySeenMetrics = sorted.filter(m => seenMetrics.has(m.metric_key));
  
  const selected: MetricSummary[] = [];
  const usedCategories = new Set<MetricCategory | undefined>();
  const usedMetricKeys = new Set<string>();
  
  // Pass 1: One UNSEEN from each category (highest severity per category)
  for (const metric of unseenMetrics) {
    if (selected.length >= limit) break;
    
    // Skip if we already have this category represented
    if (metric.category && usedCategories.has(metric.category)) continue;
    
    // Skip if already used this exact metric
    if (usedMetricKeys.has(metric.metric_key)) continue;
    
    selected.push(metric);
    if (metric.category) usedCategories.add(metric.category);
    usedMetricKeys.add(metric.metric_key);
  }
  
  // Pass 2: If we haven't filled slots yet, add SEEN metrics from unrepresented categories
  for (const metric of previouslySeenMetrics) {
    if (selected.length >= limit) break;
    
    // Skip if we already have this category represented
    if (metric.category && usedCategories.has(metric.category)) continue;
    
    // Skip if already used this exact metric
    if (usedMetricKeys.has(metric.metric_key)) continue;
    
    selected.push(metric);
    if (metric.category) usedCategories.add(metric.category);
    usedMetricKeys.add(metric.metric_key);
  }
  
  // Pass 3: Fill remaining slots preferring unseen, then seen (can repeat categories)
  for (const metric of unseenMetrics) {
    if (selected.length >= limit) break;
    if (usedMetricKeys.has(metric.metric_key)) continue;
    
    selected.push(metric);
    usedMetricKeys.add(metric.metric_key);
  }
  
  for (const metric of previouslySeenMetrics) {
    if (selected.length >= limit) break;
    if (usedMetricKeys.has(metric.metric_key)) continue;
    
    selected.push(metric);
    usedMetricKeys.add(metric.metric_key);
  }
  
  return selected;
}

const PRIORITY_METRICS = [
  'food_insecurity',
  'poverty',
  'child_poverty',
  'housing_insecurity',
  'social_isolation',
  'lack_social_support',
  'depression',
  'frequent_mental_distress',
  'diabetes',
  'health_insurance',
  'uninsured',
  'unemployment',
  'transportation_barriers',
  'utility_shutoff_threat',
  'obesity',
  'high_blood_pressure',
  'any_disability',
  'children_in_single_parent_households',
  'housing_cost_burden',
  'general_health',
  'current_smoking',
  'binge_drinking',
  'mobility_disability',
  'cognitive_disability'
];

// Public Safety metrics from Grand Rapids Police Department
const PUBLIC_SAFETY_METRICS = [
  'assault_rate',
  'theft_rate',
  'burglary_rate',
  'vandalism_rate',
  'robbery_rate',
  'drug_offense_rate',
  'weapons_offense_rate',
];

export async function GET(req: Request, res: Response) {
  try {
    const { bbox, limit = '10', seen_metrics = '' } = req.query;

    if (!bbox) {
      return res.status(400).json({ 
        error: 'bbox parameter is required (format: minLng,minLat,maxLng,maxLat)' 
      });
    }
    
    // Parse seen_metrics from comma-separated string for session-based rotation
    const seenMetricsSet = new Set<string>(
      (seen_metrics as string).split(',').filter(m => m.trim().length > 0)
    );

    const [minLng, minLat, maxLng, maxLat] = (bbox as string).split(',').map(Number);
    
    if ([minLng, minLat, maxLng, maxLat].some(isNaN)) {
      return res.status(400).json({ 
        error: 'Invalid bbox format. Expected: minLng,minLat,maxLng,maxLat' 
      });
    }

    // Calculate center point of the visible area
    const centerLng = (minLng + maxLng) / 2;
    const centerLat = (minLat + maxLat) / 2;

    // Use a small bbox around center point to fetch candidate tracts (~0.25 mile)
    // Then validate which tract actually contains the center point
    const smallDelta = 0.004; // ~0.25 mile in degrees
    const focusedMinLng = centerLng - smallDelta;
    const focusedMaxLng = centerLng + smallDelta;
    const focusedMinLat = centerLat - smallDelta;
    const focusedMaxLat = centerLat + smallDelta;
    
    // Fetch candidate tracts from TIGERweb
    let candidateTracts = await fetchTractsByBbox(focusedMinLng, focusedMinLat, focusedMaxLng, focusedMaxLat);
    
    // Find the tract that actually contains the center point using Turf.js
    // This ensures we get the correct tract even when center is near a boundary
    const centerPoint = point([centerLng, centerLat]);
    let containingTract = null;
    
    for (const tract of candidateTracts) {
      try {
        if (tract.geometry && booleanPointInPolygon(centerPoint, tract.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon)) {
          containingTract = tract;
          break;
        }
      } catch (e) {
        // Skip tracts with invalid geometry
        continue;
      }
    }
    
    // Use the containing tract, or fall back to first candidate if point-in-polygon fails
    const tracts = containingTract 
      ? [containingTract] 
      : (candidateTracts.length > 0 ? [candidateTracts[0]] : []);
    
    console.log(`Community needs: Found ${containingTract ? 'exact' : 'fallback'} tract from ${candidateTracts.length} candidates`);
    
    if (tracts.length === 0) {
      return res.json({
        prompts: [],
        area_summary: {
          center: [centerLng, centerLat],
          critical_count: 0,
          concerning_count: 0
        }
      });
    }

    const tractFips = tracts.map(t => t.properties.GEOID);
    const tractFips11 = tractFips.map(fips => fips.substring(0, 11));

    const metricData: Map<string, Map<string, number>> = new Map();

    const cdcMetrics = PRIORITY_METRICS.filter(m => getMetricMeasureId(m) !== null);
    for (const metricKey of cdcMetrics.slice(0, 15)) {
      const measureId = getMetricMeasureId(metricKey);
      if (!measureId) continue;

      try {
        const cdcData = await fetchCDCPlacesDataForTracts(measureId, tractFips11);
        if (cdcData.size > 0) {
          const values = new Map<string, number>();
          tractFips.forEach((fullFips, idx) => {
            const fips11 = tractFips11[idx];
            const record = cdcData.get(fips11);
            if (record && record.data_value) {
              const value = parseFloat(record.data_value);
              // Filter out invalid values (NaN, negative sentinels, infinity)
              if (!isNaN(value) && value >= 0 && isFinite(value)) {
                values.set(fullFips, value);
              }
            }
          });
          if (values.size > 0) {
            metricData.set(metricKey, values);
          }
        }
      } catch (err) {
        console.warn(`Failed to fetch CDC data for ${metricKey}:`, err);
      }
    }

    const censusMetrics = PRIORITY_METRICS.filter(m => isCensusMetric(m));
    for (const metricKey of censusMetrics) {
      if (metricData.has(metricKey)) continue;
      
      try {
        const censusData = await fetchCensusACSDataForTracts(metricKey, tractFips);
        if (censusData.size > 0) {
          const values = new Map<string, number>();
          censusData.forEach((data, fips) => {
            // Filter out null, NaN, and sentinel values (-999 = insufficient data)
            const estimate = data.values.estimate;
            if (estimate !== null && !isNaN(estimate) && estimate > -900) {
              values.set(fips, estimate);
            }
          });
          if (values.size > 0) {
            metricData.set(metricKey, values);
          }
        }
      } catch (err) {
        console.warn(`Failed to fetch Census data for ${metricKey}:`, err);
      }
    }

    // Fetch Public Safety (crime) data from Supabase
    // MUST match overlay filters: geo_level=tract, group_name=Total, data_period=12mo_rolling
    try {
      const { data: crimeMetrics } = await supabase
        .from('health_metrics')
        .select('id, metric_key')
        .in('metric_key', PUBLIC_SAFETY_METRICS);

      if (crimeMetrics && crimeMetrics.length > 0) {
        const metricIds = crimeMetrics.map(m => m.id);
        
        // Use 11-digit FIPS codes for crime data (how it's stored in database)
        const tractFips11 = tractFips.map(fips => fips.substring(0, 11));
        
        const { data: crimeData } = await supabase
          .from('health_metric_data')
          .select('metric_id, geo_fips, estimate')
          .in('metric_id', metricIds)
          .in('geo_fips', tractFips11)
          .eq('geo_level', 'tract')
          .eq('group_name', 'Total')
          .eq('data_period', '12mo_rolling')
          .not('estimate', 'is', null);

        if (crimeData && crimeData.length > 0) {
          const metricIdToKey = new Map(crimeMetrics.map(m => [m.id, m.metric_key]));
          
          // Group crime data by metric
          const crimeByMetric = new Map<string, Map<string, number>>();
          
          for (const row of crimeData) {
            const metricKey = metricIdToKey.get(row.metric_id);
            if (!metricKey || row.estimate === null) continue;
            
            if (!crimeByMetric.has(metricKey)) {
              crimeByMetric.set(metricKey, new Map());
            }
            crimeByMetric.get(metricKey)!.set(row.geo_fips, row.estimate);
          }
          
          // Add crime metrics to metricData
          crimeByMetric.forEach((values, metricKey) => {
            if (values.size > 0) {
              metricData.set(metricKey, values);
            }
          });
        }
      }
    } catch (err) {
      console.warn('Failed to fetch crime data:', err);
    }

    const metricSummaries: MetricSummary[] = [];
    
    metricData.forEach((tractValues, metricKey) => {
      // Filter out any remaining invalid values before averaging
      const values = Array.from(tractValues.values()).filter(v => 
        v !== null && !isNaN(v) && v > -900 && isFinite(v)
      );
      if (values.length === 0) return;
      
      const avgValue = values.reduce((a, b) => a + b, 0) / values.length;
      const severity = getSeverityLevel(avgValue, metricKey);
      const metricInfo = HEALTH_METRIC_KEYS[metricKey];
      const category = getMetricCategory(metricKey);
      
      // Only include metrics that cross the concerning threshold
      if (severity === 'concerning' || severity === 'critical' || severity === 'very_critical') {
        metricSummaries.push({
          metric_key: metricKey,
          display: metricInfo?.display || metricKey,
          category,
          avg_value: avgValue,
          severity,
          tract_count: values.length
        });
      }
    });

    // Use category-balanced selection with session-based rotation to ensure diversity
    const topMetrics = selectCategoryBalancedMetrics(
      metricSummaries, 
      parseInt(limit as string, 10),
      seenMetricsSet
    );
    
    // Log category diversity and rotation status for debugging
    const categoryCounts = new Map<string, number>();
    let unseenCount = 0;
    for (const m of topMetrics) {
      const cat = m.category || 'unknown';
      categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
      if (!seenMetricsSet.has(m.metric_key)) unseenCount++;
    }
    console.log(`📊 Category diversity: ${Array.from(categoryCounts.entries()).map(([c, n]) => `${c}:${n}`).join(' | ')} | new:${unseenCount}/${topMetrics.length}`);
    const metricKeys = topMetrics.map(m => m.metric_key);

    // Fetch platform setting for prayer prompt style
    let prayerPromptStyle = 'context'; // Default to context-based (rich prompts)
    try {
      const { data: settings } = await supabase
        .from('platform_settings')
        .select('key, value')
        .eq('key', 'prayerPromptStyle')
        .single();
      
      if (settings?.value) {
        prayerPromptStyle = settings.value;
      }
    } catch (e) {
      // Use default if setting doesn't exist
    }

    const resolvedPrompts: ResolvedPrayerPrompt[] = [];

    // Only fetch context-based prompts if that style is selected
    if (prayerPromptStyle === 'context') {
      const { data: prompts, error: promptsError } = await supabase
        .from('prayer_prompt_types')
        .select('*')
        .in('metric_key', metricKeys.length > 0 ? metricKeys : ['__none__'])
        .eq('is_active', true);

      if (promptsError) {
        console.error('Error fetching prayer prompts:', promptsError);
      }

      const promptsByMetric = new Map<string, PrayerPromptType[]>();
      (prompts || []).forEach((p: PrayerPromptType) => {
        const existing = promptsByMetric.get(p.metric_key) || [];
        existing.push(p);
        promptsByMetric.set(p.metric_key, existing);
      });

      // Track prompt selections for debug logging
      const promptDebugInfo: string[] = [];
      let metricIndex = 0;

      for (const summary of topMetrics) {
        const metricPrompts = promptsByMetric.get(summary.metric_key) || [];
        
        const applicablePrompts = metricPrompts.filter(p => 
          p.severity_levels.includes(summary.severity)
        );

        if (applicablePrompts.length > 0) {
          // Use rotation offset instead of random for consistent variety
          // Add metricIndex to differentiate prompts within same request
          const offset = getPromptRotationOffset(centerLat, centerLng, applicablePrompts.length);
          const selectedIndex = (offset + metricIndex) % applicablePrompts.length;
          const selectedPrompt = applicablePrompts[selectedIndex];
          
          // Debug: track which prompt was selected
          if (promptDebugInfo.length < 5) {
            promptDebugInfo.push(`${summary.metric_key.substring(0, 12)}: ${selectedIndex}/${applicablePrompts.length}`);
          }
          metricIndex++;

          const areaName = 'this community';
          const prayerText = selectedPrompt.prayer_template
            .replace(/\{area_name\}/g, areaName)
            .replace(/\{church_name\}/g, 'the local church')
            .replace(/\{metric_value\}/g, summary.avg_value.toFixed(1) + '%');

          resolvedPrompts.push({
            id: selectedPrompt.id,
            metric_key: summary.metric_key,
            metric_display: summary.display,
            severity: summary.severity,
            need_description: selectedPrompt.need_description,
            prayer_text: prayerText,
            area_name: areaName,
            value: summary.avg_value
          });
        } else {
          // Fallback if no context prompt exists for this metric
          const isCrimeMetric = summary.metric_key.includes('_rate') && (
            summary.metric_key.includes('assault') || summary.metric_key.includes('theft') || 
            summary.metric_key.includes('burglary') || summary.metric_key.includes('vandalism') ||
            summary.metric_key.includes('robbery') || summary.metric_key.includes('drug') ||
            summary.metric_key.includes('vehicle') || summary.metric_key.includes('fraud') ||
            summary.metric_key.includes('sex_offense') || summary.metric_key.includes('weapons')
          );
          const valueDisplay = isCrimeMetric
            ? `${summary.avg_value.toFixed(1)} per 100K`
            : `${summary.avg_value.toFixed(1)}%`;
          
          resolvedPrompts.push({
            id: `fallback-${summary.metric_key}`,
            metric_key: summary.metric_key,
            metric_display: summary.display,
            severity: summary.severity,
            need_description: `${summary.display} is elevated in this area (${valueDisplay})`,
            prayer_text: `Lord, we lift up the community needs related to ${summary.display.toLowerCase()}. Bring healing, provision, and hope to those affected.`,
            area_name: 'this community',
            value: summary.avg_value
          });
        }
      }
      
      // Debug log for prompt diversity verification (inside context block)
      if (promptDebugInfo.length > 0) {
        console.log(`🙏 Community prompts diversity: ${promptDebugInfo.join(' | ')}`);
      }
    } else {
      // Data-based prompts - show factual statistics
      for (const summary of topMetrics) {
        const isCrimeMetric = summary.metric_key.includes('_rate') && (
          summary.metric_key.includes('assault') || summary.metric_key.includes('theft') || 
          summary.metric_key.includes('burglary') || summary.metric_key.includes('vandalism') ||
          summary.metric_key.includes('robbery') || summary.metric_key.includes('drug') ||
          summary.metric_key.includes('vehicle') || summary.metric_key.includes('fraud') ||
          summary.metric_key.includes('sex_offense') || summary.metric_key.includes('weapons')
        );
        const valueDisplay = isCrimeMetric 
          ? `${summary.avg_value.toFixed(1)} per 100K`
          : `${summary.avg_value.toFixed(1)}%`;
        
        resolvedPrompts.push({
          id: `data-${summary.metric_key}`,
          metric_key: summary.metric_key,
          metric_display: summary.display,
          severity: summary.severity,
          need_description: `${summary.display} is ${valueDisplay} in this area`,
          prayer_text: `Lord, we lift up the community needs related to ${summary.display.toLowerCase()}. Bring healing, provision, and hope to those affected.`,
          area_name: 'this community',
          value: summary.avg_value
        });
      }
    }

    const criticalCount = metricSummaries.filter(m => 
      m.severity === 'critical' || m.severity === 'very_critical'
    ).length;
    const concerningCount = metricSummaries.filter(m => 
      m.severity === 'concerning'
    ).length;

    return res.json({
      prompts: resolvedPrompts,
      area_summary: {
        center: [centerLng, centerLat],
        critical_count: criticalCount,
        concerning_count: concerningCount
      }
    });

  } catch (error) {
    console.error('Prayer prompts GET error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
