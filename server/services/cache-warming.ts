import { createClient } from '@supabase/supabase-js';
import { fetchCDCPlacesData, METRIC_KEY_TO_CDC_MEASUREID } from './cdc-places';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const PRIORITY_METRICS = [
  'food_insecurity',
  'housing_insecurity',
  'social_isolation',
  'lack_social_support',
  'depression',
  'frequent_mental_distress',
  'diabetes',
  'health_insurance',
  'transportation_barriers',
  'utility_shutoff_threat',
  'obesity',
  'high_blood_pressure',
  'any_disability',
  'general_health',
  'current_smoking',
  'binge_drinking',
];

const STATE_FIPS_TO_ABBR: Record<string, string> = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA',
  '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL',
  '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN',
  '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME',
  '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS',
  '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
  '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI',
  '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI',
  '56': 'WY', '72': 'PR',
};

interface CityPlatform {
  id: string;
  name: string;
  default_center_lat: number | null;
  default_center_lng: number | null;
  is_active: boolean;
}

function getStateFromCoordinates(lat: number, lng: number): string | null {
  if (lat >= 32.5 && lat <= 42 && lng >= -124.5 && lng <= -114) return 'CA';
  if (lat >= 25.8 && lat <= 36.5 && lng >= -106.6 && lng <= -93.5) return 'TX';
  if (lat >= 41.7 && lat <= 47.5 && lng >= -90.4 && lng <= -82.4) return 'MI';
  if (lat >= 25 && lat <= 31 && lng >= -87.6 && lng <= -80) return 'FL';
  if (lat >= 40.5 && lat <= 45.1 && lng >= -79.8 && lng <= -71.9) return 'NY';
  if (lat >= 39.7 && lat <= 42.5 && lng >= -80.5 && lng <= -74.7) return 'PA';
  if (lat >= 38.4 && lat <= 42 && lng >= -84.8 && lng <= -80.5) return 'OH';
  if (lat >= 37 && lat <= 39.5 && lng >= -82.6 && lng <= -75.2) return 'VA';
  if (lat >= 33.8 && lat <= 36.6 && lng >= -84.3 && lng <= -75.5) return 'NC';
  if (lat >= 33 && lat <= 35 && lng >= -88.5 && lng <= -84.9) return 'GA';
  if (lat >= 37 && lat <= 41 && lng >= -91.5 && lng <= -87.5) return 'IL';
  if (lat >= 42 && lat <= 46.2 && lng >= -92.9 && lng <= -87) return 'WI';
  if (lat >= 43 && lat <= 49 && lng >= -97.2 && lng <= -89.5) return 'MN';
  if (lat >= 39 && lat <= 40.6 && lng >= -86.3 && lng <= -84.8) return 'IN';
  if (lat >= 35 && lat <= 36.7 && lng >= -90.3 && lng <= -81.7) return 'TN';
  if (lat >= 36.5 && lat <= 39.5 && lng >= -95 && lng <= -89) return 'MO';
  if (lat >= 31 && lat <= 35.1 && lng >= -94.1 && lng <= -89) return 'LA';
  if (lat >= 31.3 && lat <= 35 && lng >= -88.5 && lng <= -84.9) return 'AL';
  if (lat >= 30 && lat <= 35.5 && lng >= -91.7 && lng <= -88) return 'MS';
  if (lat >= 33.5 && lat <= 36.5 && lng >= -82.4 && lng <= -78.6) return 'SC';
  if (lat >= 33 && lat <= 37.5 && lng >= -94.6 && lng <= -89.6) return 'AR';
  if (lat >= 36.5 && lat <= 39.1 && lng >= -83.7 && lng <= -75.2) return 'WV';
  if (lat >= 36.5 && lat <= 39.5 && lng >= -89.6 && lng <= -82) return 'KY';
  if (lat >= 37 && lat <= 42 && lng >= -102.1 && lng <= -94.6) return 'KS';
  if (lat >= 36 && lat <= 37 && lng >= -103 && lng <= -94.4) return 'OK';
  if (lat >= 40 && lat <= 43.5 && lng >= -104.1 && lng <= -95.3) return 'NE';
  if (lat >= 42.5 && lat <= 49 && lng >= -104.1 && lng <= -96.6) return 'ND';
  if (lat >= 42.5 && lat <= 46 && lng >= -104.1 && lng <= -96.4) return 'SD';
  if (lat >= 41 && lat <= 43.5 && lng >= -96.6 && lng <= -90.1) return 'IA';
  if (lat >= 37 && lat <= 41.1 && lng >= -109.1 && lng <= -102) return 'CO';
  if (lat >= 31.3 && lat <= 37 && lng >= -109.1 && lng <= -103) return 'NM';
  if (lat >= 31.3 && lat <= 37 && lng >= -114.9 && lng <= -109) return 'AZ';
  if (lat >= 35 && lat <= 42 && lng >= -120 && lng <= -114) return 'NV';
  if (lat >= 37 && lat <= 42.1 && lng >= -114.1 && lng <= -109) return 'UT';
  if (lat >= 42 && lat <= 49 && lng >= -117 && lng <= -111) return 'MT';
  if (lat >= 42 && lat <= 49 && lng >= -111.1 && lng <= -104) return 'WY';
  if (lat >= 42 && lat <= 49 && lng >= -117.3 && lng <= -111) return 'ID';
  if (lat >= 45.5 && lat <= 49 && lng >= -124.8 && lng <= -116.9) return 'WA';
  if (lat >= 42 && lat <= 46.3 && lng >= -124.6 && lng <= -116.5) return 'OR';
  return null;
}

export async function warmCDCCache(): Promise<void> {
  // Defer cache warming to let server handle requests first
  console.log('🔥 CDC cache warming scheduled (starting in 30s)...');
  await new Promise(resolve => setTimeout(resolve, 30000));

  console.log('🔥 Starting CDC cache warming for all city platforms...');
  const startTime = Date.now();

  if (!supabaseUrl || !supabaseServiceKey) {
    console.log('⚠️ Supabase credentials not available, skipping cache warming');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { data: platforms, error } = await supabase
      .from('city_platforms')
      .select('id, name, default_center_lat, default_center_lng, is_active')
      .eq('is_active', true);

    if (error) {
      console.error('❌ Failed to fetch city platforms:', error);
      return;
    }

    if (!platforms || platforms.length === 0) {
      console.log('⚠️ No active city platforms found');
      return;
    }

    console.log(`📍 Found ${platforms.length} active city platforms`);

    const statesNeeded = new Set<string>();

    for (const platform of platforms) {
      if (platform.default_center_lat && platform.default_center_lng) {
        const state = getStateFromCoordinates(
          platform.default_center_lat,
          platform.default_center_lng
        );
        if (state) {
          statesNeeded.add(state);
        }
      }
    }

    if (statesNeeded.size === 0) {
      console.log('⚠️ No states determined from platforms');
      return;
    }

    console.log(`🗺️ Warming cache for ${statesNeeded.size} states: ${Array.from(statesNeeded).join(', ')}`);

    const cdcMetrics = PRIORITY_METRICS.filter(m => METRIC_KEY_TO_CDC_MEASUREID[m]);

    let successCount = 0;
    let errorCount = 0;
    let consecutiveErrors = 0;

    for (const state of Array.from(statesNeeded)) {
      console.log(`   🏛️ Warming cache for ${state}...`);

      // Process metrics in batches of 2 to limit concurrency
      for (let i = 0; i < cdcMetrics.length; i += 2) {
        // If CDC API appears down, skip remaining
        if (consecutiveErrors >= 5) {
          console.warn('   ⚠️ CDC API appears unreachable, skipping remaining metrics');
          errorCount += (cdcMetrics.length - i) * (Array.from(statesNeeded).indexOf(state) === statesNeeded.size - 1 ? 1 : 0);
          break;
        }

        const batch = cdcMetrics.slice(i, i + 2);
        const results = await Promise.allSettled(
          batch.map(metricKey => {
            const measureId = METRIC_KEY_TO_CDC_MEASUREID[metricKey];
            return measureId ? fetchCDCPlacesData(measureId, state) : Promise.reject('no measureId');
          })
        );

        for (const result of results) {
          if (result.status === 'fulfilled') {
            successCount++;
            consecutiveErrors = 0;
          } else {
            errorCount++;
            consecutiveErrors++;
          }
        }

        // Brief pause between batches
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Reset consecutive errors between states
      consecutiveErrors = 0;
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ CDC cache warming complete in ${duration}s (${successCount} cached, ${errorCount} errors)`);

  } catch (error) {
    console.error('❌ CDC cache warming failed:', error);
  }
}

export async function warmCacheForPlatform(platformId: string): Promise<void> {
  if (!supabaseUrl || !supabaseServiceKey) return;
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  const { data: platform } = await supabase
    .from('city_platforms')
    .select('id, name, default_center_lat, default_center_lng')
    .eq('id', platformId)
    .single();
  
  if (!platform?.default_center_lat || !platform?.default_center_lng) return;
  
  const state = getStateFromCoordinates(
    platform.default_center_lat,
    platform.default_center_lng
  );
  
  if (!state) return;
  
  console.log(`🔥 Warming cache for ${platform.name} (${state})...`);
  
  const cdcMetrics = PRIORITY_METRICS.filter(m => METRIC_KEY_TO_CDC_MEASUREID[m]);
  
  for (const metricKey of cdcMetrics) {
    const measureId = METRIC_KEY_TO_CDC_MEASUREID[metricKey];
    if (!measureId) continue;
    
    try {
      await fetchCDCPlacesData(measureId, state);
    } catch (err) {
    }
    
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  console.log(`✅ Cache warming complete for ${platform.name}`);
}
