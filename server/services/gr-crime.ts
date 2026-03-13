// Grand Rapids Crime Data Service
// Source: Grand Rapids Police Department Open Data
// API: https://services2.arcgis.com/L81TiOwAPO1ZvU9b/arcgis/rest/services/CRIME_DALLLLLLL/FeatureServer/0

const GR_CRIME_API = 'https://services2.arcgis.com/L81TiOwAPO1ZvU9b/arcgis/rest/services/CRIME_DALLLLLLL/FeatureServer/0';

export interface GRCrimeRecord {
  ObjectID: number;
  USER_INCNUMBER: string;
  USER_OFFENSECODE: string;
  USER_Beat__: string;
  USER_Service_Area: string;
  USER_MICRCODE: string;
  USER_Offense_Description: string;
  USER_NIBRS_Maping: string;
  USER_NIBRS_Category: string;
  USER_NIBRS_GRP: string;
  USER_OFFENSETITLE: string;
  USER_DATEOFOFFENSE: number;
  USER_Day_of_the_Week: string;
  USER_Weapon_Type: string;
  USER_BLOCK_ADDRESS__INCIDENT_LOCATIO: string;
  USER_Month: string;
  USER_YTD_Indicator: string;
  X: number;
  Y: number;
}

export interface CrimePoint {
  id: string;
  x: number;
  y: number;
  category: 'person' | 'property' | 'society' | 'local';
  offenseType: string;
  date: Date;
}

export interface TractCrimeStats {
  tractFips: string;
  totalCrimes: number;
  violentCrimes: number;
  propertyCrimes: number;
  population?: number;
  totalCrimeRate?: number;
  violentCrimeRate?: number;
  propertyCrimeRate?: number;
}

const CACHE_TTL = 60 * 60 * 1000;
const crimeCache = new Map<string, { data: CrimePoint[]; timestamp: number }>();

function mapNIBRSCategory(category: string): 'person' | 'property' | 'society' | 'local' {
  const normalized = category?.toLowerCase() || '';
  if (normalized.includes('person')) return 'person';
  if (normalized.includes('property')) return 'property';
  if (normalized.includes('society')) return 'society';
  return 'local';
}

export async function fetchCrimeData(
  startDate?: Date,
  endDate?: Date,
  resultOffset: number = 0,
  resultRecordCount: number = 2000
): Promise<CrimePoint[]> {
  const cacheKey = `crime_${startDate?.toISOString() || 'all'}_${endDate?.toISOString() || 'all'}_${resultOffset}`;
  const cached = crimeCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`Using cached GR crime data (offset ${resultOffset})`);
    return cached.data;
  }
  
  try {
    let whereClause = '1=1';
    
    if (startDate) {
      const startMs = startDate.getTime();
      whereClause = `USER_DATEOFOFFENSE >= ${startMs}`;
      
      if (endDate) {
        const endMs = endDate.getTime();
        whereClause += ` AND USER_DATEOFOFFENSE <= ${endMs}`;
      }
    }
    
    const params = new URLSearchParams({
      where: whereClause,
      outFields: '*',
      f: 'json',
      resultOffset: String(resultOffset),
      resultRecordCount: String(resultRecordCount),
    });
    
    const url = `${GR_CRIME_API}/query?${params.toString()}`;
    console.log(`Fetching GR crime data: offset=${resultOffset}, count=${resultRecordCount}`);
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });
    
    if (!response.ok) {
      const text = await response.text();
      console.error(`GR Crime API error: ${response.status} - ${text.substring(0, 200)}`);
      throw new Error(`GR Crime API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.features || !Array.isArray(data.features)) {
      console.warn('No features in GR crime response');
      return [];
    }
    
    const crimePoints: CrimePoint[] = data.features
      .filter((f: any) => f.attributes && f.attributes.X && f.attributes.Y)
      .map((f: any) => {
        const attrs = f.attributes as GRCrimeRecord;
        return {
          id: attrs.USER_INCNUMBER,
          x: attrs.X,
          y: attrs.Y,
          category: mapNIBRSCategory(attrs.USER_NIBRS_Category),
          offenseType: attrs.USER_NIBRS_GRP || attrs.USER_Offense_Description || 'Unknown',
          date: new Date(attrs.USER_DATEOFOFFENSE),
        };
      });
    
    crimeCache.set(cacheKey, { data: crimePoints, timestamp: Date.now() });
    console.log(`Got ${crimePoints.length} crime points from GR API`);
    
    return crimePoints;
  } catch (error) {
    console.error('Error fetching GR crime data:', error);
    return [];
  }
}

export async function fetchAllCrimeData(
  startDate?: Date,
  endDate?: Date
): Promise<CrimePoint[]> {
  const allCrimes: CrimePoint[] = [];
  let offset = 0;
  const batchSize = 2000;
  let hasMore = true;
  
  console.log(`Fetching all crime data from ${startDate?.toISOString() || 'beginning'} to ${endDate?.toISOString() || 'now'}`);
  
  while (hasMore) {
    const batch = await fetchCrimeData(startDate, endDate, offset, batchSize);
    allCrimes.push(...batch);
    
    if (batch.length < batchSize) {
      hasMore = false;
    } else {
      offset += batchSize;
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`Fetched total of ${allCrimes.length} crime records`);
  return allCrimes;
}

export async function getRecordCount(startDate?: Date, endDate?: Date): Promise<number> {
  try {
    let whereClause = '1=1';
    
    if (startDate) {
      const startMs = startDate.getTime();
      whereClause = `USER_DATEOFOFFENSE >= ${startMs}`;
      
      if (endDate) {
        const endMs = endDate.getTime();
        whereClause += ` AND USER_DATEOFOFFENSE <= ${endMs}`;
      }
    }
    
    const params = new URLSearchParams({
      where: whereClause,
      returnCountOnly: 'true',
      f: 'json',
    });
    
    const url = `${GR_CRIME_API}/query?${params.toString()}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to get count: ${response.status}`);
    }
    
    const data = await response.json();
    return data.count || 0;
  } catch (error) {
    console.error('Error getting crime record count:', error);
    return 0;
  }
}

export function aggregateCrimesToTracts(
  crimes: CrimePoint[],
  tractPolygons: Map<string, { geometry: any; population: number }>
): TractCrimeStats[] {
  const tractStats = new Map<string, TractCrimeStats>();
  
  const tractEntries = Array.from(tractPolygons.entries());
  for (const [tractFips, { population }] of tractEntries) {
    tractStats.set(tractFips, {
      tractFips,
      totalCrimes: 0,
      violentCrimes: 0,
      propertyCrimes: 0,
      population,
    });
  }
  
  let assignedCrimes = 0;
  
  for (const crime of crimes) {
    let foundTract: string | null = null;
    
    for (const [tractFips, { geometry }] of tractEntries) {
      if (pointInPolygon([crime.x, crime.y], geometry)) {
        foundTract = tractFips;
        break;
      }
    }
    
    if (foundTract) {
      const stats = tractStats.get(foundTract)!;
      stats.totalCrimes++;
      
      if (crime.category === 'person') {
        stats.violentCrimes++;
      } else if (crime.category === 'property') {
        stats.propertyCrimes++;
      }
      
      assignedCrimes++;
    }
  }
  
  console.log(`Assigned ${assignedCrimes}/${crimes.length} crimes to tracts`);
  
  const statsValues = Array.from(tractStats.values());
  for (const stats of statsValues) {
    if (stats.population && stats.population > 0) {
      stats.totalCrimeRate = (stats.totalCrimes / stats.population) * 1000;
      stats.violentCrimeRate = (stats.violentCrimes / stats.population) * 1000;
      stats.propertyCrimeRate = (stats.propertyCrimes / stats.population) * 1000;
    }
  }
  
  return statsValues;
}

function pointInPolygon(point: [number, number], geometry: any): boolean {
  if (!geometry) return false;
  
  const [x, y] = point;
  
  const polygons = geometry.type === 'MultiPolygon' 
    ? geometry.coordinates 
    : [geometry.coordinates];
  
  for (const polygon of polygons) {
    const ring = polygon[0];
    if (!ring || ring.length < 3) continue;
    
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    
    if (inside) return true;
  }
  
  return false;
}

export const CRIME_METRIC_KEYS = ['violent_crime_rate', 'property_crime_rate', 'total_crime_rate'];

export function isCrimeMetric(metricKey: string): boolean {
  return CRIME_METRIC_KEYS.includes(metricKey);
}
