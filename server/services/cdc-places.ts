// CDC PLACES API Service
// https://data.cdc.gov/500-Cities-Places/PLACES-Local-Data-for-Better-Health-Census-Tract-D/cwsq-ngmh
// No authentication required!

const CDC_PLACES_BASE = 'https://data.cdc.gov/resource/cwsq-ngmh.json';

export interface CDCPlacesData {
  year: string;
  stateabbr: string;
  statedesc: string;
  countyfips: string;
  countyname: string;
  locationname: string;
  datasource: string;
  category: string;
  measure: string;
  measureid: string;
  data_value_type: string;
  data_value: string;
  data_value_unit: string;
  low_confidence_limit: string;
  high_confidence_limit: string;
  totalpopulation: string;
  locationid: string;
  categoryid: string;
  geolocation?: {
    latitude: string;
    longitude: string;
  };
}

// Mapping from our metric keys to CDC PLACES measureid values
// Full list: https://data.cdc.gov/500-Cities-Places/PLACES-Local-Data-for-Better-Health-Census-Tract-D/cwsq-ngmh
export const METRIC_KEY_TO_CDC_MEASUREID: Record<string, string> = {
  // ==================== HEALTH BEHAVIORS ====================
  current_smoking: 'CSMOKING',
  binge_drinking: 'BINGE',
  physical_inactivity: 'LPA',
  obesity: 'OBESITY',
  sleep_less_than_7_hours: 'SLEEP',
  sleep: 'SLEEP',
  
  // ==================== HEALTH OUTCOMES ====================
  diabetes: 'DIABETES',
  high_blood_pressure: 'BPHIGH',
  high_cholesterol: 'HIGHCHOL',
  asthma: 'CASTHMA',
  // kidney_disease - NOT available in CDC PLACES tract-level data
  copd: 'COPD',
  heart_disease: 'CHD',
  cardiovascular_disease: 'CHD',
  stroke: 'STROKE',
  cancer: 'CANCER',
  depression: 'DEPRESSION',
  arthritis: 'ARTHRITIS',
  general_health: 'GHLTH',
  teeth_lost: 'TEETHLOST',
  
  // ==================== MENTAL & PHYSICAL HEALTH ====================
  mental_health_not_good: 'MHLTH',
  frequent_mental_distress: 'MHLTH',
  physical_health_not_good: 'PHLTH',
  frequent_physical_distress: 'PHLTH',
  
  // ==================== PREVENTION & CLINICAL CARE ====================
  dental_visit: 'DENTAL',
  health_insurance: 'ACCESS2',
  routine_checkup: 'CHECKUP',
  taking_bp_medication: 'BPMED',
  cholesterol_screening: 'CHOLSCREEN',
  colorectal_cancer_screening: 'COLON_SCREEN',
  cervical_cancer_screening: 'CERVICAL',
  mammography: 'MAMMOUSE',
  core_preventive_men: 'COREM',
  core_preventive_women: 'COREW',
  
  // ==================== DISABILITIES ====================
  hearing_disability: 'HEARING',
  vision_disability: 'VISION',
  cognitive_disability: 'COGNITION',
  mobility_disability: 'MOBILITY',
  self_care_disability: 'SELFCARE',
  independent_living_disability: 'INDEPLIVE',
  any_disability: 'DISABILITY',
  
  // ==================== SOCIAL NEEDS (CDC PLACES 2024) ====================
  food_insecurity: 'FOODINSECU',
  food_stamps: 'FOODSTAMP',
  housing_insecurity: 'HOUSINSECU',
  transportation_barriers: 'LACKTRPT',
  utility_shutoff_threat: 'SHUTUTILITY',
  social_isolation: 'ISOLATION',
  lack_social_support: 'EMOTIONSPT',
};

// Cache for CDC data
const cdcDataCache = new Map<string, { data: CDCPlacesData[]; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function fetchCDCPlacesData(
  measureId: string,
  stateAbbr?: string,
  countyFips?: string,
  limit: number = 50000
): Promise<CDCPlacesData[]> {
  const cacheKey = `cdc_${measureId}_${stateAbbr || 'all'}_${countyFips || 'all'}`;
  const cached = cdcDataCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`Using cached CDC PLACES data for ${measureId}`);
    return cached.data;
  }
  
  try {
    // Build query parameters - don't filter by data_value_type to get all available data
    const params = new URLSearchParams({
      measureid: measureId,
      '$limit': String(limit),
    });
    
    if (stateAbbr) {
      params.set('stateabbr', stateAbbr);
    }
    
    if (countyFips) {
      params.set('countyfips', countyFips);
    }
    
    const url = `${CDC_PLACES_BASE}?${params.toString()}`;
    console.log(`Fetching CDC PLACES data: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      const text = await response.text();
      console.error(`CDC PLACES API error: ${response.status} - ${text.substring(0, 200)}`);
      throw new Error(`CDC PLACES API error: ${response.status}`);
    }
    
    const data: CDCPlacesData[] = await response.json();
    console.log(`Got ${data.length} records from CDC PLACES for ${measureId}`);
    
    // Cache the data
    cdcDataCache.set(cacheKey, { data, timestamp: Date.now() });
    
    return data;
  } catch (error) {
    console.error(`Error fetching CDC PLACES data for ${measureId}:`, error);
    return [];
  }
}

// Get data for specific tracts
export async function fetchCDCPlacesDataForTracts(
  measureId: string,
  tractFips: string[]
): Promise<Map<string, CDCPlacesData>> {
  const result = new Map<string, CDCPlacesData>();
  
  if (tractFips.length === 0) return result;
  
  // Group tracts by state for more efficient queries
  const tractsByState = new Map<string, string[]>();
  tractFips.forEach(fips => {
    const stateCode = fips.substring(0, 2);
    const stateAbbr = STATE_FIPS_TO_ABBR[stateCode];
    if (stateAbbr) {
      if (!tractsByState.has(stateAbbr)) {
        tractsByState.set(stateAbbr, []);
      }
      tractsByState.get(stateAbbr)!.push(fips);
    }
  });
  
  // Fetch data for each state
  const stateEntries = Array.from(tractsByState.entries());
  for (const [stateAbbr, tracts] of stateEntries) {
    const data = await fetchCDCPlacesData(measureId, stateAbbr);
    
    // Create a set for fast lookup
    const tractSet = new Set(tracts);
    
    // Debug: log first few tracts from request and first few from CDC data
    const sampleTracts = tracts.slice(0, 3);
    const sampleCDC = data.slice(0, 3).map(d => d.locationid);
    console.log(`Matching tracts - Request sample: ${sampleTracts.join(', ')}`);
    console.log(`Matching tracts - CDC sample: ${sampleCDC.join(', ')}`);
    
    // Map data by tract FIPS (locationid is the tract FIPS in CDC PLACES)
    let matchCount = 0;
    data.forEach(record => {
      if (tractSet.has(record.locationid)) {
        result.set(record.locationid, record);
        matchCount++;
      }
    });
    console.log(`Matched ${matchCount}/${tracts.length} tracts with CDC data`);
  }
  
  return result;
}

// State FIPS to abbreviation mapping
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

// Convert our metric key to CDC measureid
export function getMetricMeasureId(metricKey: string): string | null {
  return METRIC_KEY_TO_CDC_MEASUREID[metricKey] || null;
}
