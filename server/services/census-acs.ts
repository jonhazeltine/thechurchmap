// Census Bureau American Community Survey (ACS) API Service
// https://www.census.gov/data/developers/data-sets/acs-5year.html
// Free API - works without key (25 calls/day) or with free key (500 calls/day)

const CENSUS_ACS_BASE = 'https://api.census.gov/data/2023/acs/acs5';

export interface CensusACSData {
  tractFips: string;
  name: string;
  values: Record<string, number | null>;
}

// Mapping from our metric keys to Census ACS variable codes
// Full variable list: https://api.census.gov/data/2023/acs/acs5/variables.html
export const METRIC_KEY_TO_CENSUS_VARS: Record<string, { 
  variables: string[]; 
  calculate: (values: Record<string, number>, tractFips?: string) => number;
  description: string;
}> = {
  // Poverty - % below poverty level
  poverty: {
    variables: ['B17001_001E', 'B17001_002E'], // total, below poverty
    calculate: (v) => {
      const total = v.B17001_001E || 0;
      if (total <= 0) return -999; // Insufficient data
      const rate = ((v.B17001_002E || 0) / total) * 100;
      return Math.min(Math.max(rate, 0), 100);
    },
    description: 'Poverty rate (% below poverty level)'
  },
  child_poverty: {
    // B17001 variables for children under 18 (both below and above poverty)
    // Below poverty: B17001_004E-009E (male), B17001_018E-023E (female)
    // Above poverty: B17001_033E-038E (male), B17001_047E-052E (female)
    variables: [
      // Children below poverty
      'B17001_004E', 'B17001_005E', 'B17001_006E', 'B17001_007E', 'B17001_008E', 'B17001_009E',
      'B17001_018E', 'B17001_019E', 'B17001_020E', 'B17001_021E', 'B17001_022E', 'B17001_023E',
      // Children above poverty (for denominator)
      'B17001_033E', 'B17001_034E', 'B17001_035E', 'B17001_036E', 'B17001_037E', 'B17001_038E',
      'B17001_047E', 'B17001_048E', 'B17001_049E', 'B17001_050E', 'B17001_051E', 'B17001_052E'
    ],
    calculate: (v) => {
      // Sum of children (under 18) below poverty
      const childrenBelowPoverty = (v.B17001_004E || 0) + (v.B17001_005E || 0) + (v.B17001_006E || 0) + 
                                    (v.B17001_007E || 0) + (v.B17001_008E || 0) + (v.B17001_009E || 0) +
                                    (v.B17001_018E || 0) + (v.B17001_019E || 0) + (v.B17001_020E || 0) +
                                    (v.B17001_021E || 0) + (v.B17001_022E || 0) + (v.B17001_023E || 0);
      // Sum of children (under 18) above poverty
      const childrenAbovePoverty = (v.B17001_033E || 0) + (v.B17001_034E || 0) + (v.B17001_035E || 0) +
                                    (v.B17001_036E || 0) + (v.B17001_037E || 0) + (v.B17001_038E || 0) +
                                    (v.B17001_047E || 0) + (v.B17001_048E || 0) + (v.B17001_049E || 0) +
                                    (v.B17001_050E || 0) + (v.B17001_051E || 0) + (v.B17001_052E || 0);
      // Total children = below + above poverty
      const totalChildren = childrenBelowPoverty + childrenAbovePoverty;
      
      // Minimum population threshold - tracts with very few children produce unreliable rates
      // Return -999 as "insufficient data" marker (will show as gray on map)
      const MIN_CHILDREN_THRESHOLD = 50;
      if (totalChildren < MIN_CHILDREN_THRESHOLD) {
        return -999; // Insufficient data marker
      }
      
      return (childrenBelowPoverty / totalChildren) * 100;
    },
    description: 'Child poverty rate (% children under 18 below poverty)'
  },

  // Unemployment - % unemployed in labor force
  unemployment: {
    variables: ['B23025_003E', 'B23025_005E'], // in labor force, unemployed
    calculate: (v) => {
      const laborForce = v.B23025_003E || 0;
      if (laborForce <= 0) return -999; // Insufficient data
      const rate = ((v.B23025_005E || 0) / laborForce) * 100;
      return Math.min(Math.max(rate, 0), 100);
    },
    description: 'Unemployment rate (% of labor force)'
  },

  // Education - % without high school diploma (inverse of completion)
  high_school_completion: {
    variables: ['B15003_001E', 'B15003_017E', 'B15003_018E', 'B15003_019E', 'B15003_020E', 'B15003_021E', 'B15003_022E', 'B15003_023E', 'B15003_024E', 'B15003_025E'],
    calculate: (v) => {
      const total = v.B15003_001E || 0;
      if (total <= 0) return -999; // Insufficient data
      // Sum of HS diploma and higher / total population 25+
      const hsOrHigher = (v.B15003_017E || 0) + (v.B15003_018E || 0) + (v.B15003_019E || 0) + 
                         (v.B15003_020E || 0) + (v.B15003_021E || 0) + (v.B15003_022E || 0) +
                         (v.B15003_023E || 0) + (v.B15003_024E || 0) + (v.B15003_025E || 0);
      const rate = (hsOrHigher / total) * 100;
      return Math.min(Math.max(rate, 0), 100);
    },
    description: 'High school completion rate (% with HS diploma or higher)'
  },

  // Income inequality (GINI coefficient, 0-1 scale, multiply by 100 for display)
  income_inequality: {
    variables: ['B19083_001E'], // GINI index
    calculate: (v) => v.B19083_001E * 100, // Convert to 0-100 scale
    description: 'Income inequality (GINI coefficient, 0-100)'
  },

  // Single-parent households
  children_in_single_parent_households: {
    variables: ['B09002_001E', 'B09002_008E', 'B09002_015E'], // total, male householder no spouse, female householder no spouse
    calculate: (v) => {
      const total = v.B09002_001E || 0;
      const singleParent = (v.B09002_008E || 0) + (v.B09002_015E || 0);
      
      // Guard against division by zero and small sample sizes
      const MIN_CHILDREN_THRESHOLD = 20;
      if (total <= 0 || total < MIN_CHILDREN_THRESHOLD) {
        return -999; // Insufficient data marker
      }
      
      // Calculate and clamp to 0-100% (sanity check)
      const rate = (singleParent / total) * 100;
      return Math.min(Math.max(rate, 0), 100);
    },
    description: 'Children in single-parent households (%)'
  },

  // Health insurance (uninsured rate)
  uninsured: {
    variables: ['B27001_001E', 'B27001_005E', 'B27001_008E', 'B27001_011E', 'B27001_014E', 'B27001_017E', 'B27001_020E', 'B27001_023E', 'B27001_026E', 'B27001_029E',
                'B27001_033E', 'B27001_036E', 'B27001_039E', 'B27001_042E', 'B27001_045E', 'B27001_048E', 'B27001_051E', 'B27001_054E', 'B27001_057E'],
    calculate: (v) => {
      const total = v.B27001_001E || 0;
      if (total <= 0) return -999; // Insufficient data
      // Sum of all uninsured age groups
      const uninsured = (v.B27001_005E || 0) + (v.B27001_008E || 0) + (v.B27001_011E || 0) + 
                        (v.B27001_014E || 0) + (v.B27001_017E || 0) + (v.B27001_020E || 0) +
                        (v.B27001_023E || 0) + (v.B27001_026E || 0) + (v.B27001_029E || 0) +
                        (v.B27001_033E || 0) + (v.B27001_036E || 0) + (v.B27001_039E || 0) +
                        (v.B27001_042E || 0) + (v.B27001_045E || 0) + (v.B27001_048E || 0) +
                        (v.B27001_051E || 0) + (v.B27001_054E || 0) + (v.B27001_057E || 0);
      const rate = (uninsured / total) * 100;
      return Math.min(Math.max(rate, 0), 100);
    },
    description: 'Uninsured rate (%)'
  },

  // Racial/ethnic diversity (using entropy index or % non-white)
  racial_ethnic_diversity: {
    variables: ['B02001_001E', 'B02001_002E'], // total, white alone
    calculate: (v) => {
      const total = v.B02001_001E || 0;
      if (total <= 0) return -999; // Insufficient data
      const whiteAlone = v.B02001_002E || 0;
      const rate = ((total - whiteAlone) / total) * 100;
      return Math.min(Math.max(rate, 0), 100);
    },
    description: 'Racial/ethnic diversity (% non-white)'
  },

  // Broadband access
  broadband_connection: {
    variables: ['B28002_001E', 'B28002_004E'], // total households, with broadband
    calculate: (v) => {
      const total = v.B28002_001E || 0;
      if (total <= 0) return -999; // Insufficient data
      const rate = ((v.B28002_004E || 0) / total) * 100;
      return Math.min(Math.max(rate, 0), 100);
    },
    description: 'Broadband internet access (%)'
  },

  // Housing cost burden (% of households spending 30%+ of income on housing)
  // Uses B25070 (Gross Rent) for renters and B25091 (Owner Costs) for owners
  // More reliable than B25106 which has complex nested structure
  housing_cost_burden: {
    variables: [
      // Renter cost burden (B25070: Gross Rent as % of Household Income)
      'B25070_001E', // Total renter households computed
      'B25070_007E', // 30 to 34.9 percent
      'B25070_008E', // 35 to 39.9 percent
      'B25070_009E', // 40 to 49.9 percent
      'B25070_010E', // 50 percent or more
      // Owner cost burden (B25091: Mortgage Status by Owner Costs as % of Income)
      'B25091_001E', // Total owner households computed
      'B25091_008E', // With mortgage, 30 to 34.9 percent
      'B25091_009E', // With mortgage, 35 to 39.9 percent
      'B25091_010E', // With mortgage, 40 to 49.9 percent
      'B25091_011E', // With mortgage, 50 percent or more
      'B25091_019E', // Without mortgage, 30 to 34.9 percent
      'B25091_020E', // Without mortgage, 35 to 39.9 percent
      'B25091_021E', // Without mortgage, 40 to 49.9 percent
      'B25091_022E'  // Without mortgage, 50 percent or more
    ],
    calculate: (v) => {
      const totalRenters = v.B25070_001E || 0;
      const totalOwners = v.B25091_001E || 0;
      const totalHouseholds = totalRenters + totalOwners;
      
      if (totalHouseholds <= 0) return -999; // Insufficient data
      
      // Renters paying 30%+ of income on housing
      const renterBurdened = (v.B25070_007E || 0) + (v.B25070_008E || 0) + 
                             (v.B25070_009E || 0) + (v.B25070_010E || 0);
      
      // Owners paying 30%+ of income on housing (with and without mortgage)
      const ownerBurdened = (v.B25091_008E || 0) + (v.B25091_009E || 0) + 
                            (v.B25091_010E || 0) + (v.B25091_011E || 0) +
                            (v.B25091_019E || 0) + (v.B25091_020E || 0) + 
                            (v.B25091_021E || 0) + (v.B25091_022E || 0);
      
      const burden = ((renterBurdened + ownerBurdened) / totalHouseholds) * 100;
      return burden;
    },
    description: 'Housing cost burden (% spending 30%+ income on housing)'
  },

  // Racial/Ethnic Isolation (Herfindahl-Hirschman Index for racial homogeneity)
  // Higher = more homogeneous/isolated, Lower = more diverse
  // HHI = Σ(share_i)² where share_i is the proportion of each racial group
  // Range: ~0.2 (5 equal groups) to 1.0 (completely homogeneous)
  // Uses B03002 (Hispanic/Latino by Race) for proper Hispanic categorization
  racial_ethnic_isolation: {
    variables: [
      'B03002_001E', // Total population
      'B03002_003E', // White alone, not Hispanic
      'B03002_004E', // Black/African American alone, not Hispanic
      'B03002_006E', // Asian alone, not Hispanic
      'B03002_012E', // Hispanic or Latino (any race)
      'B03002_005E', // American Indian/Alaska Native alone, not Hispanic
      'B03002_007E', // Native Hawaiian/Pacific Islander alone, not Hispanic
      'B03002_008E', // Other race alone, not Hispanic
      'B03002_009E'  // Two or more races, not Hispanic
    ],
    calculate: (v) => {
      const total = v.B03002_001E || 0;
      if (total <= 0) return -999; // Insufficient data
      
      // Calculate share for each racial/ethnic group
      const whiteShare = (v.B03002_003E || 0) / total;
      const blackShare = (v.B03002_004E || 0) / total;
      const asianShare = (v.B03002_006E || 0) / total;
      const hispanicShare = (v.B03002_012E || 0) / total;
      const otherShare = ((v.B03002_005E || 0) + (v.B03002_007E || 0) + 
                          (v.B03002_008E || 0) + (v.B03002_009E || 0)) / total;
      
      // HHI = sum of squared shares (Σs²)
      // Using explicit accumulation for clarity
      let hhi = 0;
      hhi += whiteShare * whiteShare;
      hhi += blackShare * blackShare;
      hhi += asianShare * asianShare;
      hhi += hispanicShare * hispanicShare;
      hhi += otherShare * otherShare;
      
      // Convert to 0-100 scale
      // Minimum theoretical value ~20 (5 equal groups), max 100 (single group)
      return hhi * 100;
    },
    description: 'Racial/ethnic isolation index (20-100, higher = more homogeneous)'
  },

  // ============================================
  // EXPANDED METRICS (6 new)
  // ============================================

  // Median Household Income
  median_household_income: {
    variables: ['B19013_001E'], // Median household income
    calculate: (v) => v.B19013_001E || 0,
    description: 'Median household income ($)'
  },

  // Age Demographics - Seniors (65+)
  seniors_65_plus: {
    variables: [
      'B01001_001E', // Total population
      'B01001_020E', 'B01001_021E', 'B01001_022E', 'B01001_023E', 'B01001_024E', 'B01001_025E', // Male 65+
      'B01001_044E', 'B01001_045E', 'B01001_046E', 'B01001_047E', 'B01001_048E', 'B01001_049E'  // Female 65+
    ],
    calculate: (v) => {
      const total = v.B01001_001E || 0;
      if (total <= 0) return -999; // Insufficient data
      
      const seniors = (v.B01001_020E || 0) + (v.B01001_021E || 0) + (v.B01001_022E || 0) +
                      (v.B01001_023E || 0) + (v.B01001_024E || 0) + (v.B01001_025E || 0) +
                      (v.B01001_044E || 0) + (v.B01001_045E || 0) + (v.B01001_046E || 0) +
                      (v.B01001_047E || 0) + (v.B01001_048E || 0) + (v.B01001_049E || 0);
      
      const rate = (seniors / total) * 100;
      return Math.min(Math.max(rate, 0), 100);
    },
    description: 'Senior population 65+ (%)'
  },

  // Age Demographics - Youth (under 18)
  youth_under_18: {
    variables: [
      'B01001_001E', // Total population
      'B01001_003E', 'B01001_004E', 'B01001_005E', 'B01001_006E', // Male under 18
      'B01001_027E', 'B01001_028E', 'B01001_029E', 'B01001_030E'  // Female under 18
    ],
    calculate: (v) => {
      const total = v.B01001_001E || 0;
      if (total <= 0) return -999; // Insufficient data
      
      const youth = (v.B01001_003E || 0) + (v.B01001_004E || 0) + (v.B01001_005E || 0) + (v.B01001_006E || 0) +
                    (v.B01001_027E || 0) + (v.B01001_028E || 0) + (v.B01001_029E || 0) + (v.B01001_030E || 0);
      
      const rate = (youth / total) * 100;
      return Math.min(Math.max(rate, 0), 100);
    },
    description: 'Youth population under 18 (%)'
  },

  // Veteran Population
  veteran_population: {
    variables: ['B21001_001E', 'B21001_002E'], // Total 18+, Veterans
    calculate: (v) => {
      const total = v.B21001_001E || 0;
      if (total <= 0) return -999; // Insufficient data
      const rate = ((v.B21001_002E || 0) / total) * 100;
      return Math.min(Math.max(rate, 0), 100);
    },
    description: 'Veteran population (%)'
  },

  // Limited English Proficiency
  limited_english: {
    variables: [
      'B16004_001E', // Total population 5+ years
      'B16004_003E', 'B16004_005E', 'B16004_010E', 'B16004_012E', // Spanish speakers less than very well
      'B16004_017E', 'B16004_019E', 'B16004_022E', 'B16004_024E', // Other Indo-European less than very well
      'B16004_027E', 'B16004_029E', 'B16004_032E', 'B16004_034E', // Asian/Pacific less than very well
      'B16004_037E', 'B16004_039E', 'B16004_042E', 'B16004_044E'  // Other languages less than very well
    ],
    calculate: (v) => {
      const total = v.B16004_001E || 0;
      if (total <= 0) return -999; // Insufficient data
      
      // Sum all "speak English less than very well"
      const limitedEnglish = (v.B16004_005E || 0) + (v.B16004_012E || 0) +
                             (v.B16004_019E || 0) + (v.B16004_024E || 0) +
                             (v.B16004_029E || 0) + (v.B16004_034E || 0) +
                             (v.B16004_039E || 0) + (v.B16004_044E || 0);
      
      const rate = (limitedEnglish / total) * 100;
      return Math.min(Math.max(rate, 0), 100);
    },
    description: 'Limited English proficiency (%)'
  },

  // No Vehicle Households
  no_vehicle: {
    variables: ['B25044_001E', 'B25044_003E', 'B25044_010E'], // Total, Owner no vehicle, Renter no vehicle
    calculate: (v) => {
      const total = v.B25044_001E || 0;
      if (total <= 0) return -999; // Insufficient data
      
      const noVehicle = (v.B25044_003E || 0) + (v.B25044_010E || 0);
      const rate = (noVehicle / total) * 100;
      return Math.min(Math.max(rate, 0), 100);
    },
    description: 'Households with no vehicle (%)'
  },

  // Disability Rate
  disability_rate: {
    variables: ['B18101_001E', 'B18101_004E', 'B18101_007E', 'B18101_010E', 'B18101_013E', 'B18101_016E', 'B18101_019E',
                'B18101_023E', 'B18101_026E', 'B18101_029E', 'B18101_032E', 'B18101_035E', 'B18101_038E'],
    calculate: (v) => {
      const total = v.B18101_001E || 0;
      if (total <= 0) return -999; // Insufficient data
      
      // Sum all with disabilities (male + female across age groups)
      const withDisability = (v.B18101_004E || 0) + (v.B18101_007E || 0) + (v.B18101_010E || 0) +
                             (v.B18101_013E || 0) + (v.B18101_016E || 0) + (v.B18101_019E || 0) +
                             (v.B18101_023E || 0) + (v.B18101_026E || 0) + (v.B18101_029E || 0) +
                             (v.B18101_032E || 0) + (v.B18101_035E || 0) + (v.B18101_038E || 0);
      
      const rate = (withDisability / total) * 100;
      return Math.min(Math.max(rate, 0), 100);
    },
    description: 'Population with disability (%)'
  },
};

// Cache for Census data
const censusDataCache = new Map<string, { data: Map<string, CensusACSData>; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Get Census API key from environment (optional)
const getCensusApiKey = () => process.env.CENSUS_API_KEY || '';

export async function fetchCensusACSData(
  metricKey: string,
  stateFips: string,
  countyFips?: string
): Promise<Map<string, CensusACSData>> {
  const result = new Map<string, CensusACSData>();
  
  const metricConfig = METRIC_KEY_TO_CENSUS_VARS[metricKey];
  if (!metricConfig) {
    console.log(`Metric ${metricKey} not mapped to Census ACS variables`);
    return result;
  }

  const cacheKey = `census_${metricKey}_${stateFips}_${countyFips || 'all'}`;
  const cached = censusDataCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`Using cached Census ACS data for ${metricKey}`);
    return cached.data;
  }

  try {
    // Build query
    const variables = ['NAME', ...metricConfig.variables].join(',');
    let geoQuery = `for=tract:*&in=state:${stateFips}`;
    if (countyFips) {
      geoQuery += `&in=county:${countyFips}`;
    }

    const apiKey = getCensusApiKey();
    const keyParam = apiKey ? `&key=${apiKey}` : '';
    
    const url = `${CENSUS_ACS_BASE}?get=${variables}&${geoQuery}${keyParam}`;
    console.log(`Fetching Census ACS data: ${url.replace(apiKey, '***')}`);

    const response = await fetch(url);
    
    if (!response.ok) {
      const text = await response.text();
      console.error(`Census ACS API error: ${response.status} - ${text.substring(0, 200)}`);
      return result;
    }

    const data = await response.json();
    
    if (!Array.isArray(data) || data.length < 2) {
      console.log('No Census ACS data returned');
      return result;
    }

    // First row is headers, rest is data
    const headers = data[0] as string[];
    const rows = data.slice(1) as string[][];

    // Find column indices
    const nameIdx = headers.indexOf('NAME');
    const stateIdx = headers.indexOf('state');
    const countyIdx = headers.indexOf('county');
    const tractIdx = headers.indexOf('tract');

    for (const row of rows) {
      const tractFips = `${row[stateIdx]}${row[countyIdx]}${row[tractIdx]}`;
      const values: Record<string, number> = {};
      
      for (let i = 0; i < headers.length; i++) {
        const header = headers[i];
        if (metricConfig.variables.includes(header)) {
          const val = parseFloat(row[i]);
          values[header] = isNaN(val) || val < 0 ? 0 : val;
        }
      }

      // Calculate the metric value
      try {
        const estimate = metricConfig.calculate(values, tractFips);
        if (!isNaN(estimate) && isFinite(estimate)) {
          result.set(tractFips, {
            tractFips,
            name: row[nameIdx] || tractFips,
            values: { estimate, ...values }
          });
        }
      } catch (e) {
        // Skip tracts with calculation errors
      }
    }

    console.log(`Got ${result.size} tracts from Census ACS for ${metricKey}`);
    
    // Cache results
    censusDataCache.set(cacheKey, { data: result, timestamp: Date.now() });
    
    return result;
  } catch (error) {
    console.error(`Error fetching Census ACS data for ${metricKey}:`, error);
    return result;
  }
}

// Get data for specific tracts
export async function fetchCensusACSDataForTracts(
  metricKey: string,
  tractFips: string[]
): Promise<Map<string, CensusACSData>> {
  const result = new Map<string, CensusACSData>();
  
  if (tractFips.length === 0) return result;

  // Group tracts by state for efficient queries
  const tractsByState = new Map<string, Set<string>>();
  tractFips.forEach(fips => {
    const stateFips = fips.substring(0, 2);
    if (!tractsByState.has(stateFips)) {
      tractsByState.set(stateFips, new Set());
    }
    tractsByState.get(stateFips)!.add(fips);
  });

  // Fetch data for each state
  for (const [stateFips, tracts] of tractsByState) {
    const stateData = await fetchCensusACSData(metricKey, stateFips);
    
    // Only include requested tracts
    for (const [fips, data] of stateData) {
      // Match on 11-digit tract FIPS (state + county + tract)
      const fips11 = fips.substring(0, 11);
      for (const requestedFips of tracts) {
        const requested11 = requestedFips.substring(0, 11);
        if (fips11 === requested11) {
          result.set(requestedFips, data);
        }
      }
    }
  }

  return result;
}

// Check if metric is available from Census ACS
export function isCensusMetric(metricKey: string): boolean {
  return metricKey in METRIC_KEY_TO_CENSUS_VARS;
}

// Get measure ID (returns the metric key for Census data)
export function getCensusMeasureId(metricKey: string): string | null {
  return METRIC_KEY_TO_CENSUS_VARS[metricKey] ? metricKey : null;
}

const populationCache = new Map<string, number>();

export async function fetchTractPopulation(geoid: string): Promise<number | null> {
  if (populationCache.has(geoid)) {
    return populationCache.get(geoid)!;
  }

  try {
    const state = geoid.substring(0, 2);
    const county = geoid.substring(2, 5);
    const tract = geoid.substring(5, 11);

    const apiKey = process.env.CENSUS_API_KEY || '';
    const keyParam = apiKey ? `&key=${apiKey}` : '';
    const url = `https://api.census.gov/data/2022/acs/acs5?get=B01003_001E&for=tract:${tract}&in=state:${state}&in=county:${county}${keyParam}`;

    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[Census Population] API error for ${geoid}: ${response.status}`);
      return null;
    }

    const data: string[][] = await response.json();
    if (data.length < 2) {
      return null;
    }

    const population = parseInt(data[1][0], 10);
    if (isNaN(population)) {
      return null;
    }

    populationCache.set(geoid, population);
    return population;
  } catch (error) {
    console.error(`[Census Population] Error fetching population for ${geoid}:`, error);
    return null;
  }
}
