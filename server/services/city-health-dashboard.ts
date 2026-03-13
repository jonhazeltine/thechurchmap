// City Health Dashboard API Service
// https://www.cityhealthdashboard.com/api

const CHD_API_BASE = 'https://www.cityhealthdashboard.com/api';

interface CHDMetricData {
  state_abbr: string;
  state_fips: string;
  geo_fips: string;
  geo_level: string;
  geo_name: string;
  metric_name: string;
  group_name: string;
  num: number | null;
  denom: number | null;
  est: number | null;
  lci: number | null;
  uci: number | null;
  data_period: string;
  period_type: string;
  source_name: string;
  census_parent_shape_year: number;
  version: string;
}

interface CHDMetric {
  metric_id: string;
  metric_name: string;
  metric_description: string;
}

interface CHDCity {
  geo_fips: string;
  geo_name: string;
  state_abbr: string;
  state_fips: string;
}

const API_KEY = process.env.CITY_HEALTH_DASHBOARD_API_KEY;

async function fetchWithAuth(endpoint: string): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`;
    headers['X-API-Key'] = API_KEY;
  }

  const response = await fetch(`${CHD_API_BASE}${endpoint}`, { headers });
  
  if (!response.ok) {
    const text = await response.text();
    console.error(`CHD API error: ${response.status} - ${text}`);
    throw new Error(`CHD API error: ${response.status}`);
  }
  
  return response.json();
}

export async function fetchMetrics(): Promise<CHDMetric[]> {
  try {
    const data = await fetchWithAuth('/metrics');
    return data;
  } catch (error) {
    console.error('Error fetching CHD metrics:', error);
    return [];
  }
}

export async function fetchCities(): Promise<CHDCity[]> {
  try {
    const data = await fetchWithAuth('/geographies?geo_level=city');
    return data;
  } catch (error) {
    console.error('Error fetching CHD cities:', error);
    return [];
  }
}

export async function fetchMetricData(
  metricName: string,
  geoFips?: string,
  geoLevel: string = 'city'
): Promise<CHDMetricData[]> {
  try {
    let endpoint = `/metric-data?metric_name=${encodeURIComponent(metricName)}&geo_level=${geoLevel}`;
    if (geoFips) {
      endpoint += `&geo_fips=${geoFips}`;
    }
    const data = await fetchWithAuth(endpoint);
    return data;
  } catch (error) {
    console.error('Error fetching CHD metric data:', error);
    return [];
  }
}

export async function fetchDataForCity(
  cityFips: string,
  metricName?: string
): Promise<CHDMetricData[]> {
  try {
    let endpoint = `/metric-data?geo_fips=${cityFips}&geo_level=city`;
    if (metricName) {
      endpoint += `&metric_name=${encodeURIComponent(metricName)}`;
    }
    const data = await fetchWithAuth(endpoint);
    return data;
  } catch (error) {
    console.error('Error fetching CHD city data:', error);
    return [];
  }
}

export async function fetchDataForTract(tractFips: string): Promise<CHDMetricData[]> {
  try {
    const data = await fetchWithAuth(`/metric-data?geo_fips=${tractFips}&geo_level=tract`);
    return data;
  } catch (error) {
    console.error('Error fetching CHD tract data:', error);
    return [];
  }
}

// Convert metric names to standardized keys
export function normalizeMetricKey(metricName: string): string {
  return metricName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

// Parse the -999 "not applicable" values
export function parseValue(value: number | null): number | null {
  if (value === null || value === -999) return null;
  return value;
}
