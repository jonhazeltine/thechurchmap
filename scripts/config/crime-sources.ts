/**
 * Crime Data Source Registry
 * 
 * National multi-state crime data endpoints covering 56 major US cities across 35 states.
 * Used by both Socrata and ArcGIS ingestion scripts.
 * 
 * Active Sources (Dec 2025):
 * - Socrata (24 cities): CA (LA, SF, Oakland, San Diego), TX (Dallas, Austin, San Antonio, Fort Worth),
 *   IL (Chicago), NY (NYC, Buffalo), WA (Seattle), LA (New Orleans, Baton Rouge),
 *   TN (Memphis, Chattanooga), MO (Kansas City), HI (Honolulu), OH (Cincinnati), RI (Providence),
 *   AR (Little Rock), VA (Norfolk), FL (Orlando, Fort Lauderdale), MD (Montgomery County)
 * - ArcGIS (27 cities): CA (Sacramento), MI (Detroit, Grand Rapids), TX (Houston - 30-day rolling), CO (Denver),
 *   NC (Charlotte, Raleigh), IN (Indianapolis), NV (Las Vegas), TN (Nashville), DC (Washington DC), MD (Baltimore),
 *   MN (Minneapolis), KY (Louisville), NM (Albuquerque), SC (Charleston), AZ (Phoenix, Tucson, Tempe),
 *   ID (Boise), NE (Omaha), OK (Tulsa), AK (Anchorage), GA (Atlanta), OH (Cleveland), VA (Virginia Beach)
 * - Unavailable: Columbus OH (no public crime FeatureServer), Hartford CT (GIS server down)
 * - Pending: Lansing MI, Ann Arbor MI, El Paso TX, Long Beach CA (require FeatureServer URL discovery)
 * - FBI API: National baseline for all states (agency-level)
 * 
 * Crime Type Mapping:
 * All sources are normalized to 10 standard crime metrics:
 * - assault_rate, robbery_rate, theft_rate, burglary_rate, vehicle_theft_rate
 * - vandalism_rate, fraud_rate, drug_offense_rate, weapons_offense_rate, sex_offense_rate
 */

export interface SocrataEndpoint {
  type: 'socrata';
  name: string;
  state: string;
  stateFips: string;
  domain: string;
  datasetId: string;
  fieldMappings: {
    date: string;
    offenseType: string;
    latitude?: string;
    longitude?: string;
    address?: string;
    caseNumber?: string;
  };
  offenseTypeMapping: Record<string, string>;
  datePeriod: string;
}

export interface ArcGISEndpoint {
  type: 'arcgis';
  name: string;
  state: string;
  stateFips: string;
  countyFips: string;
  serviceUrl: string;
  layerId: number;
  fieldMappings: {
    date: string;
    offenseType: string;
    latitude?: string;
    longitude?: string;
    address?: string;
    caseNumber?: string;
  };
  offenseTypeMapping: Record<string, string>;
  datePeriod: string;
}

export interface CKANEndpoint {
  type: 'ckan';
  name: string;
  state: string;
  stateFips: string;
  countyFips?: string;
  domain: string;
  resourceId: string;
  fieldMappings: {
    date: string;
    offenseType: string;
    latitude?: string;
    longitude?: string;
    address?: string;
    caseNumber?: string;
  };
  offenseTypeMapping: Record<string, string>;
  datePeriod: string;
}

export interface CartoEndpoint {
  type: 'carto';
  name: string;
  state: string;
  stateFips: string;
  countyFips?: string;
  baseUrl: string;
  tableName: string;
  fieldMappings: {
    date: string;
    offenseType: string;
    latitude?: string;
    longitude?: string;
    address?: string;
    caseNumber?: string;
  };
  offenseTypeMapping: Record<string, string>;
  datePeriod: string;
}

export type CrimeEndpoint = SocrataEndpoint | ArcGISEndpoint | CKANEndpoint | CartoEndpoint;

export const CRIME_METRIC_KEYS = [
  'assault_rate',
  'robbery_rate',
  'theft_rate',
  'burglary_rate',
  'vehicle_theft_rate',
  'vandalism_rate',
  'fraud_rate',
  'drug_offense_rate',
  'weapons_offense_rate',
  'sex_offense_rate',
] as const;

export type CrimeMetricKey = typeof CRIME_METRIC_KEYS[number];

export const NIBRS_TO_METRIC: Record<string, CrimeMetricKey> = {
  'Assault Offenses': 'assault_rate',
  'Aggravated Assault': 'assault_rate',
  'Simple Assault': 'assault_rate',
  'Intimidation': 'assault_rate',
  'ASSAULT': 'assault_rate',
  
  'Sex Offenses': 'sex_offense_rate',
  'Rape': 'sex_offense_rate',
  'Sodomy': 'sex_offense_rate',
  'Sexual Assault': 'sex_offense_rate',
  'SEX OFFENSE': 'sex_offense_rate',
  
  'Robbery': 'robbery_rate',
  'ROBBERY': 'robbery_rate',
  
  'Larceny/Theft Offenses': 'theft_rate',
  'Theft': 'theft_rate',
  'Larceny': 'theft_rate',
  'Shoplifting': 'theft_rate',
  'Theft from Building': 'theft_rate',
  'Theft from Motor Vehicle': 'theft_rate',
  'THEFT': 'theft_rate',
  
  'Burglary/Breaking & Entering': 'burglary_rate',
  'Burglary': 'burglary_rate',
  'Breaking and Entering': 'burglary_rate',
  'BURGLARY': 'burglary_rate',
  
  'Motor Vehicle Theft': 'vehicle_theft_rate',
  'Auto Theft': 'vehicle_theft_rate',
  'VEHICLE THEFT': 'vehicle_theft_rate',
  
  'Destruction/Damage/Vandalism of Property': 'vandalism_rate',
  'Vandalism': 'vandalism_rate',
  'Criminal Mischief': 'vandalism_rate',
  'VANDALISM': 'vandalism_rate',
  
  'Fraud Offenses': 'fraud_rate',
  'Fraud': 'fraud_rate',
  'Identity Theft': 'fraud_rate',
  'Credit Card Fraud': 'fraud_rate',
  'FRAUD': 'fraud_rate',
  
  'Drug/Narcotic Offenses': 'drug_offense_rate',
  'Drug': 'drug_offense_rate',
  'Narcotics': 'drug_offense_rate',
  'Drug Possession': 'drug_offense_rate',
  'DRUG': 'drug_offense_rate',
  
  'Weapon Law Violations': 'weapons_offense_rate',
  'Weapons': 'weapons_offense_rate',
  'Weapon Offense': 'weapons_offense_rate',
  'WEAPONS': 'weapons_offense_rate',
};

export const SOCRATA_ENDPOINTS: SocrataEndpoint[] = [
  // === CALIFORNIA ===
  {
    type: 'socrata',
    name: 'Los Angeles',
    state: 'CA',
    stateFips: '06',
    domain: 'data.lacity.org',
    datasetId: '2nrs-mtv8',
    fieldMappings: {
      date: 'date_occ',
      offenseType: 'crm_cd_desc',
      latitude: 'lat',
      longitude: 'lon',
      address: 'location',
      caseNumber: 'dr_no',
    },
    offenseTypeMapping: {},
    datePeriod: '2020-present',
  },
  {
    type: 'socrata',
    name: 'San Francisco',
    state: 'CA',
    stateFips: '06',
    domain: 'data.sfgov.org',
    datasetId: 'wg3w-h783',
    fieldMappings: {
      date: 'incident_date',
      offenseType: 'incident_category',
      latitude: 'latitude',
      longitude: 'longitude',
      address: 'intersection',
      caseNumber: 'incident_id',
    },
    offenseTypeMapping: {},
    datePeriod: '2018-present',
  },
  {
    type: 'socrata',
    name: 'Oakland',
    state: 'CA',
    stateFips: '06',
    domain: 'data.oaklandca.gov',
    datasetId: 'ppgh-7dqv',
    fieldMappings: {
      date: 'datetime',
      offenseType: 'crimetype',
      latitude: 'latitude',
      longitude: 'longitude',
      address: 'address',
      caseNumber: 'casenumber',
    },
    offenseTypeMapping: {},
    datePeriod: '2024',
  },
  // === TEXAS ===
  {
    type: 'socrata',
    name: 'Dallas',
    state: 'TX',
    stateFips: '48',
    domain: 'www.dallasopendata.com',
    datasetId: 'qv6i-rri7',
    fieldMappings: {
      date: 'date1',
      offenseType: 'nibrs_crime_category',
      latitude: 'geocoded_column.latitude',
      longitude: 'geocoded_column.longitude',
      address: 'location1',
      caseNumber: 'servnumb',
    },
    offenseTypeMapping: {},
    datePeriod: '2024',
  },
  // Houston moved to ArcGIS - see ARCGIS_ENDPOINTS (30-day rolling endpoint)
  {
    type: 'socrata',
    name: 'Austin',
    state: 'TX',
    stateFips: '48',
    domain: 'data.austintexas.gov',
    datasetId: 'fdj4-gpfu',
    fieldMappings: {
      date: 'occ_date_time',
      offenseType: 'crime_type',
      latitude: 'latitude',
      longitude: 'longitude',
      address: 'address',
      caseNumber: 'incident_report_number',
    },
    offenseTypeMapping: {},
    datePeriod: '2024',
  },
  {
    type: 'socrata',
    name: 'San Antonio',
    state: 'TX',
    stateFips: '48',
    domain: 'data.sanantonio.gov',
    datasetId: 'qarm-s7re',
    fieldMappings: {
      date: 'reportdatetime',
      offenseType: 'category',
      latitude: 'lat',
      longitude: 'long',
      address: 'location',
      caseNumber: 'offensenumber',
    },
    offenseTypeMapping: {},
    datePeriod: '2024',
  },
  {
    type: 'socrata',
    name: 'Fort Worth',
    state: 'TX',
    stateFips: '48',
    domain: 'data.fortworthtexas.gov',
    datasetId: 'k6ic-7kp7',
    fieldMappings: {
      date: 'from_date',
      offenseType: 'offense',
      latitude: 'latitude',
      longitude: 'longitude',
      address: 'address',
      caseNumber: 'case_number',
    },
    offenseTypeMapping: {},
    datePeriod: '2024',
  },
  // Detroit - Socrata endpoint now redirects to ArcGIS Hub, see ARCGIS_ENDPOINTS for active Detroit entry
  // === ILLINOIS ===
  {
    type: 'socrata',
    name: 'Chicago',
    state: 'IL',
    stateFips: '17',
    domain: 'data.cityofchicago.org',
    datasetId: 'ijzp-q8t2',
    fieldMappings: {
      date: 'date',
      offenseType: 'primary_type',
      latitude: 'latitude',
      longitude: 'longitude',
      address: 'block',
      caseNumber: 'case_number',
    },
    offenseTypeMapping: {},
    datePeriod: '2001-present',
  },
  // === NEW YORK ===
  {
    type: 'socrata',
    name: 'New York City',
    state: 'NY',
    stateFips: '36',
    domain: 'data.cityofnewyork.us',
    datasetId: '5uac-w243',
    fieldMappings: {
      date: 'cmplnt_fr_dt',
      offenseType: 'ofns_desc',
      latitude: 'latitude',
      longitude: 'longitude',
      address: 'boro_nm',
      caseNumber: 'cmplnt_num',
    },
    offenseTypeMapping: {
      'PETIT LARCENY': 'theft_rate',
      'GRAND LARCENY': 'theft_rate',
      'OTHER OFFENSES RELATED TO THEFT': 'theft_rate',
      'POSSESSION OF STOLEN PROPERTY': 'theft_rate',
      'ASSAULT 3 & RELATED OFFENSES': 'assault_rate',
      'FELONY ASSAULT': 'assault_rate',
      'HARRASSMENT 2': 'assault_rate',
      'OFFENSES AGAINST THE PERSON': 'assault_rate',
      'MURDER & NON-NEGL. MANSLAUGHTER': 'assault_rate',
      'HOMICIDE-NEGLIGENT,UNCLASSIFIE': 'assault_rate',
      'KIDNAPPING & RELATED OFFENSES': 'assault_rate',
      'ROBBERY': 'robbery_rate',
      'BURGLARY': 'burglary_rate',
      "BURGLAR'S TOOLS": 'burglary_rate',
      'GRAND LARCENY OF MOTOR VEHICLE': 'vehicle_theft_rate',
      'PETIT LARCENY OF MOTOR VEHICLE': 'vehicle_theft_rate',
      'UNAUTHORIZED USE OF A VEHICLE': 'vehicle_theft_rate',
      'CRIMINAL MISCHIEF & RELATED OF': 'vandalism_rate',
      'ARSON': 'vandalism_rate',
      'FORGERY': 'fraud_rate',
      'FRAUDS': 'fraud_rate',
      'THEFT-FRAUD': 'fraud_rate',
      'OFFENSES INVOLVING FRAUD': 'fraud_rate',
      'FRAUDULENT ACCOSTING': 'fraud_rate',
      'DANGEROUS DRUGS': 'drug_offense_rate',
      'CANNABIS RELATED OFFENSES': 'drug_offense_rate',
      'DANGEROUS WEAPONS': 'weapons_offense_rate',
      'UNLAWFUL POSS. WEAP. ON SCHOOL': 'weapons_offense_rate',
      'SEX CRIMES': 'sex_offense_rate',
      'RAPE': 'sex_offense_rate',
      'PROSTITUTION & RELATED OFFENSES': 'sex_offense_rate',
    },
    datePeriod: '2019-present',
  },
  // === WASHINGTON ===
  {
    type: 'socrata',
    name: 'Seattle',
    state: 'WA',
    stateFips: '53',
    domain: 'data.seattle.gov',
    datasetId: 'tazs-3rd5',
    fieldMappings: {
      date: 'offense_date',
      offenseType: 'offense_sub_category',
      latitude: 'latitude',
      longitude: 'longitude',
      address: 'block_address',
      caseNumber: 'report_number',
    },
    offenseTypeMapping: {},
    datePeriod: '2008-present',
  },
  // === LOUISIANA ===
  {
    type: 'socrata',
    name: 'New Orleans',
    state: 'LA',
    stateFips: '22',
    domain: 'data.nola.gov',
    datasetId: 'pc5d-tvaw',
    fieldMappings: {
      date: 'timecreate',
      offenseType: 'typetext',
      latitude: 'location.latitude',
      longitude: 'location.longitude',
      address: 'block_address',
      caseNumber: 'nopd_item',
    },
    offenseTypeMapping: {},
    datePeriod: '2023',
  },
  // === TENNESSEE ===
  {
    type: 'socrata',
    name: 'Memphis',
    state: 'TN',
    stateFips: '47',
    domain: 'data.memphistn.gov',
    datasetId: 'puh4-eea4',
    fieldMappings: {
      date: 'offense_date',
      offenseType: 'ucr_category',
      latitude: 'lat',
      longitude: 'long',
      address: 'full_address_100_block',
      caseNumber: 'crime_id',
    },
    offenseTypeMapping: {
      'ASSAULT': 'assault_rate',
      'AGGRAVATED ASSAULT': 'assault_rate',
      'SIMPLE ASSAULT': 'assault_rate',
      'ROBBERY': 'robbery_rate',
      'BURGLARY': 'burglary_rate',
      'LARCENY': 'theft_rate',
      'LARCENY-THEFT': 'theft_rate',
      'THEFT': 'theft_rate',
      'MOTOR VEHICLE THEFT': 'vehicle_theft_rate',
      'VANDALISM': 'vandalism_rate',
      'FRAUD': 'fraud_rate',
      'DRUG/NARCOTIC OFFENSES': 'drug_offense_rate',
      'DRUG': 'drug_offense_rate',
      'WEAPON LAW VIOLATIONS': 'weapons_offense_rate',
      'SEX OFFENSES': 'sex_offense_rate',
      'HOMICIDE': 'assault_rate',
      'MURDER': 'assault_rate',
    },
    datePeriod: '2006-present',
  },
  // === MISSOURI ===
  {
    type: 'socrata',
    name: 'Kansas City',
    state: 'MO',
    stateFips: '29',
    domain: 'data.kcmo.org',
    datasetId: 'isbe-v4d8',
    fieldMappings: {
      date: 'from_date',
      offenseType: 'description',
      latitude: 'location.coordinates[1]',
      longitude: 'location.coordinates[0]',
      address: 'address',
      caseNumber: 'report_no',
    },
    offenseTypeMapping: {
      'Aggravated Assault': 'assault_rate',
      'Simple Assault': 'assault_rate',
      'Assault': 'assault_rate',
      'Robbery': 'robbery_rate',
      'Burglary': 'burglary_rate',
      'Larceny': 'theft_rate',
      'Theft': 'theft_rate',
      'Motor Vehicle Theft': 'vehicle_theft_rate',
      'Vandalism': 'vandalism_rate',
      'Fraud': 'fraud_rate',
      'Drug/Narcotic Violations': 'drug_offense_rate',
      'Weapon Law Violations': 'weapons_offense_rate',
      'Sex Offense': 'sex_offense_rate',
      'Homicide': 'assault_rate',
    },
    datePeriod: '2024',
  },
  // === HAWAII ===
  {
    type: 'socrata',
    name: 'Honolulu',
    state: 'HI',
    stateFips: '15',
    domain: 'data.honolulu.gov',
    datasetId: 'vg88-5rn5',
    fieldMappings: {
      date: 'date',
      offenseType: 'type',
      address: 'blockaddress',
      caseNumber: 'incidentnum',
    },
    offenseTypeMapping: {},
    datePeriod: '2024',
  },
  // === OHIO ===
  {
    type: 'socrata',
    name: 'Cincinnati',
    state: 'OH',
    stateFips: '39',
    domain: 'data.cincinnati-oh.gov',
    datasetId: 'k59e-2pvf',
    fieldMappings: {
      date: 'date_reported',
      offenseType: 'offense',
      latitude: 'latitude_x',
      longitude: 'longitude_x',
      address: 'address',
      caseNumber: 'instanceid',
    },
    offenseTypeMapping: {},
    datePeriod: '2024',
  },
  // === RHODE ISLAND ===
  {
    type: 'socrata',
    name: 'Providence',
    state: 'RI',
    stateFips: '44',
    domain: 'data.providenceri.gov',
    datasetId: 'rz3y-pz8v',
    fieldMappings: {
      date: 'reported_date',
      offenseType: 'statute_desc',
      latitude: 'lat',
      longitude: 'lng',
      address: 'location',
      caseNumber: 'case_number',
    },
    offenseTypeMapping: {},
    datePeriod: '180-day rolling',
  },
  // === ARKANSAS ===
  {
    type: 'socrata',
    name: 'Little Rock',
    state: 'AR',
    stateFips: '05',
    domain: 'data.littlerock.gov',
    datasetId: '8mii-3cm3',
    fieldMappings: {
      date: 'date',
      offenseType: 'crime_type',
      latitude: 'latitude',
      longitude: 'longitude',
      address: 'address',
      caseNumber: 'case_number',
    },
    offenseTypeMapping: {},
    datePeriod: '2024',
  },
  // === VERMONT ===
  // Note: Burlington redirects to ArcGIS Hub - removed from Socrata, needs ArcGIS research
  // === VIRGINIA ===
  {
    type: 'socrata',
    name: 'Norfolk',
    state: 'VA',
    stateFips: '51',
    domain: 'data.norfolk.gov',
    datasetId: 'r7bn-2egr',
    fieldMappings: {
      date: 'date_occu',
      offenseType: 'offense',
      address: 'street',
      caseNumber: 'inci_id',
    },
    offenseTypeMapping: {},
    datePeriod: '5-year rolling',
  },
  // === FLORIDA ===
  {
    type: 'socrata',
    name: 'Orlando',
    state: 'FL',
    stateFips: '12',
    domain: 'data.cityoforlando.net',
    datasetId: '69ge-5wp8',
    fieldMappings: {
      date: 'incident_date',
      offenseType: 'incident_type',
      latitude: 'latitude',
      longitude: 'longitude',
      address: 'incident_location',
      caseNumber: 'incident_number',
    },
    offenseTypeMapping: {},
    datePeriod: '2024',
  },
  {
    type: 'socrata',
    name: 'Fort Lauderdale',
    state: 'FL',
    stateFips: '12',
    domain: 'fortlauderdale.data.socrata.com',
    datasetId: '4gb7-f88q',
    fieldMappings: {
      date: 'date_occu',
      offenseType: 'offense',
      latitude: 'geox',
      longitude: 'geoy',
      address: 'street',
      caseNumber: 'incidentid',
    },
    offenseTypeMapping: {},
    datePeriod: '2015-present',
  },
  // === NEW YORK (Additional) ===
  {
    type: 'socrata',
    name: 'Buffalo',
    state: 'NY',
    stateFips: '36',
    domain: 'data.buffalony.gov',
    datasetId: 'd6g9-xbgu',
    fieldMappings: {
      date: 'incident_datetime',
      offenseType: 'incident_type_primary',
      latitude: 'latitude',
      longitude: 'longitude',
      address: 'address_1',
      caseNumber: 'case_number',
    },
    offenseTypeMapping: {},
    datePeriod: '2024-present',
  },
  // === MARYLAND ===
  {
    type: 'socrata',
    name: 'Montgomery County',
    state: 'MD',
    stateFips: '24',
    domain: 'data.montgomerycountymd.gov',
    datasetId: 'icn6-v9z3',
    fieldMappings: {
      date: 'start_date',
      offenseType: 'crimename3',
      latitude: 'latitude',
      longitude: 'longitude',
      address: 'location',
      caseNumber: 'case_number',
    },
    offenseTypeMapping: {},
    datePeriod: '2024-present',
  },
  // === LOUISIANA (Additional) ===
  {
    type: 'socrata',
    name: 'Baton Rouge',
    state: 'LA',
    stateFips: '22',
    domain: 'data.brla.gov',
    datasetId: 'pbin-pcm7',
    fieldMappings: {
      date: 'charge_date',
      offenseType: 'offense_description',
      address: 'neighborhood',
      caseNumber: 'incident_number',
    },
    offenseTypeMapping: {},
    datePeriod: '2024-present',
  },
  // === TENNESSEE (Additional) ===
  {
    type: 'socrata',
    name: 'Chattanooga',
    state: 'TN',
    stateFips: '47',
    domain: 'www.chattadata.org',
    datasetId: 'jvkg-79ss',
    fieldMappings: {
      date: 'date_incident',
      offenseType: 'incident_description',
      latitude: 'latitude',
      longitude: 'longitude',
      address: 'address',
      caseNumber: 'case_number',
    },
    offenseTypeMapping: {},
    datePeriod: '2024-present',
  },
  // === GEORGIA ===
  {
    type: 'socrata',
    name: 'Atlanta',
    state: 'GA',
    stateFips: '13',
    domain: 'sharefulton.fultoncountyga.gov',
    datasetId: '9w3w-ynjw',
    fieldMappings: {
      date: 'occurdate',
      offenseType: 'ucrliteral',
      latitude: 'latitude',
      longitude: 'longitude',
      address: 'location',
      caseNumber: 'reportnumber',
    },
    offenseTypeMapping: {
      'AUTO THEFT': 'vehicle_theft_rate',
      'BURGLARY': 'burglary_rate',
      'ROBBERY': 'robbery_rate',
      'LARCENY-NON VEHICLE': 'theft_rate',
      'LARCENY-FROM VEHICLE': 'theft_rate',
      'AGG ASSAULT': 'assault_rate',
      'HOMICIDE': 'assault_rate',
    },
    datePeriod: '2009-present',
  },
  // === CALIFORNIA (San Diego - moved from ArcGIS) ===
  {
    type: 'socrata',
    name: 'San Diego',
    state: 'CA',
    stateFips: '06',
    domain: 'opendata.sandag.org',
    datasetId: 'pr74-d3tr',
    fieldMappings: {
      date: 'incident_date',
      offenseType: 'cibrs_offense_description',
      address: 'city',
      caseNumber: 'incidentuid',
    },
    offenseTypeMapping: {
      'Sexual Assault With An Object': 'sex_offense_rate',
      'Rape': 'sex_offense_rate',
      'Sodomy': 'sex_offense_rate',
      'Aggravated Assault': 'assault_rate',
      'Simple Assault': 'assault_rate',
      'Intimidation': 'assault_rate',
      'Robbery': 'robbery_rate',
      'Burglary/Breaking & Entering': 'burglary_rate',
      'Shoplifting': 'theft_rate',
      'Theft From Building': 'theft_rate',
      'Theft From Motor Vehicle': 'theft_rate',
      'All Other Larceny': 'theft_rate',
      'Motor Vehicle Theft': 'vehicle_theft_rate',
      'Destruction/Damage/Vandalism of Property': 'vandalism_rate',
      'False Pretenses/Swindle/Confidence Game': 'fraud_rate',
      'Identity Theft': 'fraud_rate',
      'Drug/Narcotic Violations': 'drug_offense_rate',
      'Drug Equipment Violations': 'drug_offense_rate',
      'Weapon Law Violations': 'weapons_offense_rate',
    },
    datePeriod: '2021-present',
  },
];

export const ARCGIS_ENDPOINTS: ArcGISEndpoint[] = [
  // === CALIFORNIA ===
  {
    type: 'arcgis',
    name: 'Sacramento',
    state: 'CA',
    stateFips: '06',
    countyFips: '06067',
    serviceUrl: 'https://services5.arcgis.com/54falWtcpty3V47Z/arcgis/rest/services/Sacramento_Report_Data_2024/FeatureServer',
    layerId: 0,
    fieldMappings: {
      date: 'Report_Date',
      offenseType: 'Offense_Category',
      address: 'Address_Public',
      caseNumber: 'Report_Number',
    },
    offenseTypeMapping: {},
    datePeriod: '2024',
  },
  // San Diego moved to Socrata - see SOCRATA_ENDPOINTS
  // === MICHIGAN ===
  {
    type: 'arcgis',
    name: 'Detroit',
    state: 'MI',
    stateFips: '26',
    countyFips: '26163',
    serviceUrl: 'https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/RMS_Crime_Incidents_2024/FeatureServer',
    layerId: 0,
    fieldMappings: {
      date: 'incident_occurred_at',
      offenseType: 'offense_description',
      latitude: 'latitude',
      longitude: 'longitude',
      address: 'nearest_intersection',
      caseNumber: 'crime_id',
    },
    offenseTypeMapping: {
      'AGGRAVATED / FELONIOUS ASSAULT': 'assault_rate',
      'ASSAULT AND BATTERY/SIMPLE ASSAULT': 'assault_rate',
      'ROBBERY': 'robbery_rate',
      'CARJACKING': 'robbery_rate',
      'LARCENY': 'theft_rate',
      'LARCENY - THEFT FROM BUILDING': 'theft_rate',
      'LARCENY - THEFT OF MOTOR VEHICLE PARTS / ACCESSORIES': 'theft_rate',
      'BURGLARY - FORCED ENTRY': 'burglary_rate',
      'ENTRY WITHOUT PERMISSION (NO INTENT)': 'burglary_rate',
      'MOTOR VEHICLE THEFT': 'vehicle_theft_rate',
      'DAMAGE TO PROPERTY': 'vandalism_rate',
      'FRAUD - IDENTITY THEFT': 'fraud_rate',
      'FRAUD - CREDIT CARD/AUTOMATIC TELLER MACHINE': 'fraud_rate',
      'WEAPONS OFFENSE - CONCEALED': 'weapons_offense_rate',
      'CSC 1ST DEGREE': 'sex_offense_rate',
    },
    datePeriod: '2024',
  },
  {
    type: 'arcgis',
    name: 'Grand Rapids',
    state: 'MI',
    stateFips: '26',
    countyFips: '26081',
    serviceUrl: 'https://services2.arcgis.com/L81TiOwAPO1ZvU9b/arcgis/rest/services/CRIME_DALLLLLLL/FeatureServer',
    layerId: 0,
    fieldMappings: {
      date: 'USER_DATEOFOFFENSE',
      offenseType: 'USER_NIBRS_GRP',
      caseNumber: 'USER_INCNUMBER',
    },
    offenseTypeMapping: {
      'Assault Offenses': 'assault_rate',
      'Sex Offenses': 'sex_offense_rate',
      'Robbery': 'robbery_rate',
      'Larceny/Theft Offenses': 'theft_rate',
      'Burglary/Breaking & Entering': 'burglary_rate',
      'Motor Vehicle Theft': 'vehicle_theft_rate',
      'Destruction/Damage/Vandalism of Property': 'vandalism_rate',
      'Fraud Offenses': 'fraud_rate',
      'Drug/Narcotic Offenses': 'drug_offense_rate',
      'Weapon Law Violations': 'weapons_offense_rate',
    },
    datePeriod: '2022-2025',
  },
  // NOTE: Lansing, Ann Arbor, and El Paso require FeatureServer URL research before enabling
  // These are placeholders with bare domain URLs - uncomment once verified:
  // {
  //   type: 'arcgis',
  //   name: 'Lansing',
  //   state: 'MI',
  //   stateFips: '26',
  //   countyFips: '26065',
  //   serviceUrl: 'https://data-lansing.opendata.arcgis.com', // Needs actual FeatureServer URL
  //   layerId: 0,
  //   fieldMappings: { date: 'incident_date', offenseType: 'offense_category' },
  //   offenseTypeMapping: {},
  //   datePeriod: '2024',
  // },
  // {
  //   type: 'arcgis',
  //   name: 'Ann Arbor',
  //   state: 'MI',
  //   stateFips: '26',
  //   countyFips: '26161',
  //   serviceUrl: 'https://data.a2gov.org', // Needs actual FeatureServer URL
  //   layerId: 0,
  //   fieldMappings: { date: 'incident_date', offenseType: 'crime_type' },
  //   offenseTypeMapping: {},
  //   datePeriod: '2024',
  // },
  // {
  //   type: 'arcgis',
  //   name: 'El Paso',
  //   state: 'TX',
  //   stateFips: '48',
  //   countyFips: '48141',
  //   serviceUrl: 'https://opendata.elpasotexas.gov', // Needs actual FeatureServer URL
  //   layerId: 0,
  //   fieldMappings: { date: 'date', offenseType: 'offense' },
  //   offenseTypeMapping: {},
  //   datePeriod: '2024',
  // },
  // === TEXAS (ArcGIS) ===
  {
    type: 'arcgis',
    name: 'Houston',
    state: 'TX',
    stateFips: '48',
    countyFips: '48201',
    serviceUrl: 'https://mycity2.houstontx.gov/geocloud02/rest/services/HPD/NIBRS_Recent_Crime_30days/FeatureServer',
    layerId: 0,
    fieldMappings: {
      date: 'Occurrence_Date',
      offenseType: 'RMS_Offense_Code',
      address: 'Street_Name',
      caseNumber: 'OBJECTID',
    },
    offenseTypeMapping: {
      'AGGRAVATED ASSAULT': 'assault_rate',
      'SIMPLE ASSAULT': 'assault_rate',
      'INTIMIDATION': 'assault_rate',
      'ROBBERY': 'robbery_rate',
      'BURGLARY/BREAKING AND ENTERING': 'burglary_rate',
      'SHOPLIFTING': 'theft_rate',
      'THEFT FROM BUILDING': 'theft_rate',
      'THEFT FROM MOTOR VEHICLE': 'theft_rate',
      'ALL OTHER LARCENY': 'theft_rate',
      'MOTOR VEHICLE THEFT': 'vehicle_theft_rate',
      'DESTRUCTION/DAMAGE/VANDALISM': 'vandalism_rate',
      'FALSE PRETENSES/SWINDLE': 'fraud_rate',
      'CREDIT CARD/ATM FRAUD': 'fraud_rate',
      'IDENTITY THEFT': 'fraud_rate',
      'DRUG/NARCOTIC VIOLATIONS': 'drug_offense_rate',
      'DRUG EQUIPMENT VIOLATIONS': 'drug_offense_rate',
      'WEAPON LAW VIOLATIONS': 'weapons_offense_rate',
      'FORCIBLE RAPE': 'sex_offense_rate',
      'FORCIBLE SODOMY': 'sex_offense_rate',
      'SEXUAL ASSAULT': 'sex_offense_rate',
    },
    datePeriod: '30-day rolling (cumulative)',
  },
  {
    type: 'arcgis',
    name: 'Fort Worth',
    state: 'TX',
    stateFips: '48',
    countyFips: '48439',
    serviceUrl: 'https://mapit.fortworthtexas.gov/ags/rest/services/CIVIC/Crime_Data/MapServer',
    layerId: 0,
    fieldMappings: {
      date: 'From_Date',
      offenseType: 'Offense_Desc',
      latitude: 'Latitude',
      longitude: 'Longitude',
      address: 'BLOCK_ADDRESS',
      caseNumber: 'Case_No',
    },
    offenseTypeMapping: {},
    datePeriod: '2018-present',
  },
  // === COLORADO ===
  {
    type: 'arcgis',
    name: 'Denver',
    state: 'CO',
    stateFips: '08',
    countyFips: '08031',
    serviceUrl: 'https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/arcgis/rest/services/ODC_CRIME_OFFENSES_P/FeatureServer',
    layerId: 324,
    fieldMappings: {
      date: 'FIRST_OCCURRENCE_DATE',
      offenseType: 'OFFENSE_CATEGORY_ID',
      address: 'INCIDENT_ADDRESS',
      caseNumber: 'INCIDENT_ID',
    },
    offenseTypeMapping: {},
    datePeriod: '2020-present',
  },
  // === NORTH CAROLINA ===
  {
    type: 'arcgis',
    name: 'Charlotte',
    state: 'NC',
    stateFips: '37',
    countyFips: '37119',
    serviceUrl: 'https://gis.charlottenc.gov/arcgis/rest/services/CMPD/CMPDIncidents/MapServer',
    layerId: 0,
    fieldMappings: {
      date: 'DATE_REPORTED',
      offenseType: 'HIGHEST_NIBRS_DESCRIPTION',
      latitude: 'LATITUDE_PUBLIC',
      longitude: 'LONGITUDE_PUBLIC',
      address: 'LOCATION',
      caseNumber: 'INCIDENT_REPORT_ID',
    },
    offenseTypeMapping: {},
    datePeriod: '2020-present',
  },
  // === INDIANA ===
  {
    type: 'arcgis',
    name: 'Indianapolis',
    state: 'IN',
    stateFips: '18',
    countyFips: '18097',
    serviceUrl: 'https://gis.indy.gov/server/rest/services/IMPD/IMPD_Public_Data/MapServer',
    layerId: 0,
    fieldMappings: {
      date: 'sDate',
      offenseType: 'IncidentType',
      latitude: 'Latitude',
      longitude: 'Longitude',
      address: 'sAddress',
      caseNumber: 'OBJECTID',
    },
    offenseTypeMapping: {},
    datePeriod: '2024',
  },
  // === NEVADA ===
  {
    type: 'arcgis',
    name: 'Las Vegas',
    state: 'NV',
    stateFips: '32',
    countyFips: '32003',
    serviceUrl: 'https://services.arcgis.com/jjSk6t82vIntwDbs/arcgis/rest/services/LVMPD_Weekly_NIBRS_Crimes/FeatureServer',
    layerId: 0,
    fieldMappings: {
      date: 'ReportedOn',
      offenseType: 'OffenseCategory',
      latitude: 'Latitude',
      longitude: 'Longitude',
      address: 'Location',
      caseNumber: 'Event_Number',
    },
    offenseTypeMapping: {
      'Assault Offenses': 'assault_rate',
      'Robbery': 'robbery_rate',
      'Larceny/Theft Offenses': 'theft_rate',
      'Burglary/Breaking & Entering': 'burglary_rate',
      'Motor Vehicle Theft': 'vehicle_theft_rate',
      'Destruction/Damage/Vandalism of Property': 'vandalism_rate',
      'Fraud Offenses': 'fraud_rate',
      'Drug/Narcotic Offenses': 'drug_offense_rate',
      'Weapon Law Violations': 'weapons_offense_rate',
      'Sex Offenses': 'sex_offense_rate',
    },
    datePeriod: '2021-present (weekly updates)',
  },
  // === TENNESSEE ===
  {
    type: 'arcgis',
    name: 'Nashville',
    state: 'TN',
    stateFips: '47',
    countyFips: '47037',
    serviceUrl: 'https://services2.arcgis.com/HdTo6HJqh92wn4D8/arcgis/rest/services/Metro_Nashville_Police_Department_Incidents_view/FeatureServer',
    layerId: 0,
    fieldMappings: {
      date: 'Incident_Occurred',
      offenseType: 'Report_Type_Description',
      latitude: 'Latitude',
      longitude: 'Longitude',
      address: 'Incident_Location',
      caseNumber: 'Incident_Number',
    },
    offenseTypeMapping: {},
    datePeriod: '2023-present',
  },
  // === DISTRICT OF COLUMBIA ===
  {
    type: 'arcgis',
    name: 'Washington DC',
    state: 'DC',
    stateFips: '11',
    countyFips: '11001',
    serviceUrl: 'https://maps2.dcgis.dc.gov/dcgis/rest/services/FEEDS/MPD/FeatureServer',
    layerId: 8,
    fieldMappings: {
      date: 'REPORT_DAT',
      offenseType: 'OFFENSE',
      latitude: 'LATITUDE',
      longitude: 'LONGITUDE',
      address: 'BLOCK',
      caseNumber: 'CCN',
    },
    offenseTypeMapping: {},
    datePeriod: '30-day rolling',
  },
  // === MARYLAND ===
  {
    type: 'arcgis',
    name: 'Baltimore',
    state: 'MD',
    stateFips: '24',
    countyFips: '24510',
    serviceUrl: 'https://arcgisportal.baltimorepolice.org/gis/rest/services/Crime/Public_Crime_Map_Last3Months/MapServer',
    layerId: 0,
    fieldMappings: {
      date: 'CRIME_DATE',
      offenseType: 'CRIME_TYPE',
      address: 'LOCATION',
      caseNumber: 'CCNUMBER',
    },
    offenseTypeMapping: {},
    datePeriod: '3-month rolling',
  },
  // === NORTH CAROLINA (Additional) ===
  {
    type: 'arcgis',
    name: 'Raleigh',
    state: 'NC',
    stateFips: '37',
    countyFips: '37183',
    serviceUrl: 'https://services.arcgis.com/v400IkDOw1ad7Yad/arcgis/rest/services/Raleigh_Police_Incidents_NIBRS/FeatureServer',
    layerId: 0,
    fieldMappings: {
      date: 'reported_date',
      offenseType: 'crime_category',
      latitude: 'latitude',
      longitude: 'longitude',
      address: 'location',
      caseNumber: 'case_number',
    },
    offenseTypeMapping: {},
    datePeriod: '2014-present',
  },
  // === MINNESOTA ===
  {
    type: 'arcgis',
    name: 'Minneapolis',
    state: 'MN',
    stateFips: '27',
    countyFips: '27053',
    serviceUrl: 'https://services.arcgis.com/afSMGVsC7QlRK1kZ/arcgis/rest/services/Police_Incidents_2024/FeatureServer',
    layerId: 0,
    fieldMappings: {
      date: 'reportedDate',
      offenseType: 'offense',
      address: 'publicaddress',
      caseNumber: 'caseNumber',
    },
    offenseTypeMapping: {},
    datePeriod: '2024',
  },
  // === KENTUCKY ===
  {
    type: 'arcgis',
    name: 'Louisville',
    state: 'KY',
    stateFips: '21',
    countyFips: '21111',
    serviceUrl: 'https://services1.arcgis.com/79kfd2K6fskCAkyg/arcgis/rest/services/crime_data_2025/FeatureServer',
    layerId: 0,
    fieldMappings: {
      date: 'date_reported',
      offenseType: 'offense_code_name',
      address: 'block_address',
      caseNumber: 'incident_number',
    },
    offenseTypeMapping: {
      'ASSAULT': 'assault_rate',
      'ROBBERY': 'robbery_rate',
      'THEFT': 'theft_rate',
      'BURGLARY': 'burglary_rate',
      'AUTO THEFT': 'vehicle_theft_rate',
      'VANDALISM': 'vandalism_rate',
      'FRAUD': 'fraud_rate',
    },
    datePeriod: '2025 (weekly updates)',
  },
  // === NEW MEXICO ===
  {
    type: 'arcgis',
    name: 'Albuquerque',
    state: 'NM',
    stateFips: '35',
    countyFips: '35001',
    serviceUrl: 'https://coagisweb.cabq.gov/arcgis/rest/services/public/APD_Incidents/MapServer',
    layerId: 0,
    fieldMappings: {
      date: 'ReportDateTime',
      offenseType: 'IncidentType',
      address: 'BlockAddress',
      caseNumber: 'OBJECTID',
    },
    offenseTypeMapping: {},
    datePeriod: '2024',
  },
  // === SOUTH CAROLINA ===
  {
    type: 'arcgis',
    name: 'Charleston',
    state: 'SC',
    stateFips: '45',
    countyFips: '45019',
    serviceUrl: 'https://gis.charleston-sc.gov/arcgis/rest/services/PublicSafety/CrimesPublic/MapServer',
    layerId: 0,
    fieldMappings: {
      date: 'Date',
      offenseType: 'Offense_Category',
      latitude: 'Latitude',
      longitude: 'Longitude',
      address: 'Address',
      caseNumber: 'Case_Number',
    },
    offenseTypeMapping: {},
    datePeriod: '2024',
  },
  // === ARIZONA ===
  {
    type: 'arcgis',
    name: 'Phoenix',
    state: 'AZ',
    stateFips: '04',
    countyFips: '04013',
    serviceUrl: 'https://services2.arcgis.com/2t1927381mhTgWNC/arcgis/rest/services/Crime_Data/FeatureServer',
    layerId: 0,
    fieldMappings: {
      date: 'OCCURRED_ON',
      offenseType: 'UCR_CRIME_CATEGORY',
      latitude: 'LAT',
      longitude: 'LON',
      address: 'PREMISE_ADDRESS',
      caseNumber: 'INC_NUMBER',
    },
    offenseTypeMapping: {},
    datePeriod: '2023-present',
  },
  {
    type: 'arcgis',
    name: 'Tempe',
    state: 'AZ',
    stateFips: '04',
    countyFips: '04013',
    serviceUrl: 'https://services.arcgis.com/lQySeXwbBg53XWDi/arcgis/rest/services/General_Offenses_(Open_Data)/FeatureServer',
    layerId: 0,
    fieldMappings: {
      date: 'OccurrenceDatetime',
      offenseType: 'OffenseCustom',
      latitude: 'Latitude',
      longitude: 'Longitude',
      address: 'ObfuscatedAddress',
      caseNumber: 'PrimaryKey',
    },
    offenseTypeMapping: {},
    datePeriod: '2013-present',
  },
  // === IDAHO ===
  {
    type: 'arcgis',
    name: 'Boise',
    state: 'ID',
    stateFips: '16',
    countyFips: '16001',
    serviceUrl: 'https://services1.arcgis.com/WHM6qC35aMtyAAlN/arcgis/rest/services/BPD_Crimes_Public/FeatureServer',
    layerId: 0,
    fieldMappings: {
      date: 'OccurredDateTime',
      offenseType: 'CrimeCodeDescription',
      address: 'IncidentAddress',
      caseNumber: 'DRNumber',
    },
    offenseTypeMapping: {
      'ASSAULT': 'assault_rate',
      'ROBBERY': 'robbery_rate',
      'THEFT': 'theft_rate',
      'BURGLARY': 'burglary_rate',
      'MOTOR VEHICLE THEFT': 'vehicle_theft_rate',
      'VANDALISM': 'vandalism_rate',
      'FRAUD': 'fraud_rate',
      'DRUG': 'drug_offense_rate',
    },
    datePeriod: '5-year rolling (daily updates)',
  },
  // === NEBRASKA ===
  {
    type: 'arcgis',
    name: 'Omaha',
    state: 'NE',
    stateFips: '31',
    countyFips: '31055',
    serviceUrl: 'https://gis.cityofomaha.org/arcgis/rest/services/Police/CrimeData/MapServer',
    layerId: 0,
    fieldMappings: {
      date: 'Report_Date',
      offenseType: 'Offense',
      address: 'Block_Address',
      caseNumber: 'Case_Number',
    },
    offenseTypeMapping: {},
    datePeriod: '2024',
  },
  // === OKLAHOMA ===
  {
    type: 'arcgis',
    name: 'Tulsa',
    state: 'OK',
    stateFips: '40',
    countyFips: '40143',
    serviceUrl: 'https://services.arcgis.com/XSeYKQzfXnEgju9o/arcgis/rest/services/Crime/FeatureServer',
    layerId: 0,
    fieldMappings: {
      date: 'date',
      offenseType: 'crime',
      caseNumber: 'OBJECTID',
    },
    offenseTypeMapping: {},
    datePeriod: '2024',
  },
  // === ALASKA ===
  {
    type: 'arcgis',
    name: 'Anchorage',
    state: 'AK',
    stateFips: '02',
    countyFips: '02020',
    serviceUrl: 'https://gis.muni.org/arcgis/rest/services/OpenData/PublicSafety/MapServer',
    layerId: 0,
    fieldMappings: {
      date: 'Date',
      offenseType: 'Offense',
      address: 'Address',
      caseNumber: 'Case_Number',
    },
    offenseTypeMapping: {},
    datePeriod: '2024',
  },
  // === OHIO (ArcGIS) ===
  {
    type: 'arcgis',
    name: 'Cleveland',
    state: 'OH',
    stateFips: '39',
    countyFips: '39035',
    serviceUrl: 'https://services3.arcgis.com/dty2kHktVXHrqO8i/arcgis/rest/services/Crime_Incidents/FeatureServer',
    layerId: 0,
    fieldMappings: {
      date: 'ReportedDate',
      offenseType: 'UCRdesc',
      address: 'District',
      caseNumber: 'CaseNumber',
    },
    offenseTypeMapping: {},
    datePeriod: '2016-present',
  },
  // === GEORGIA ===
  // Atlanta - MOVED TO SOCRATA: The ArcGIS endpoint below contains mislabeled DC data (not Atlanta)
  // Real Atlanta data is at sharefulton.fultoncountyga.gov dataset 9w3w-ynjw (386K records, 2009-present)
  // {
  //   type: 'arcgis',
  //   name: 'Atlanta',
  //   state: 'GA',
  //   stateFips: '13',
  //   countyFips: '13121',
  //   serviceUrl: 'https://services.arcgis.com/hRUr1F8lE8Jq2uJo/ArcGIS/rest/services/Crime_Incidents_Pulsing/FeatureServer',
  //   layerId: 0,
  //   fieldMappings: {
  //     date: 'REPORT_DAT',
  //     offenseType: 'OFFENSE',
  //     address: 'CCN',
  //     caseNumber: 'CCN',
  //   },
  //   offenseTypeMapping: {},
  //   datePeriod: '2024',
  // },
  // === OHIO (ArcGIS) ===
  // Columbus - UNAVAILABLE: No public crime incidents FeatureServer exposed (only dispatch calls, not crime data)
  // {
  //   type: 'arcgis',
  //   name: 'Columbus',
  //   state: 'OH',
  //   stateFips: '39',
  //   countyFips: '39049',
  //   serviceUrl: 'https://services5.arcgis.com/4Y6pAk8A6W1TZ6Po/arcgis/rest/services/City_of_Columbus_Police_Dispatched_Calls/FeatureServer',
  //   layerId: 0,
  //   fieldMappings: { date: 'INIT_DTTM', offenseType: 'DISP_NATURE', address: 'STREET_NAME', caseNumber: 'REPORTNUM' },
  //   offenseTypeMapping: {},
  //   datePeriod: '2024',
  // },
  // === ARIZONA (Additional) ===
  {
    type: 'arcgis',
    name: 'Tucson',
    state: 'AZ',
    stateFips: '04',
    countyFips: '04019',
    serviceUrl: 'https://services3.arcgis.com/9coHY2fvuFjG9HQX/arcgis/rest/services/TPD_OpenData_view/FeatureServer',
    layerId: 1,
    fieldMappings: {
      date: 'EventDate',
      offenseType: 'EventType',
      address: 'Division',
      caseNumber: 'EventID',
    },
    offenseTypeMapping: {
      'Assault': 'assault_rate',
      'Violent Crime': 'assault_rate',
      'Robbery': 'robbery_rate',
      'Theft': 'theft_rate',
      'Burglary': 'burglary_rate',
      'Vehicle Theft': 'vehicle_theft_rate',
      'Vandalism': 'vandalism_rate',
      'Drug': 'drug_offense_rate',
    },
    datePeriod: '2024',
  },
  // === VIRGINIA (Additional) ===
  {
    type: 'arcgis',
    name: 'Virginia Beach',
    state: 'VA',
    stateFips: '51',
    countyFips: '51810',
    serviceUrl: 'https://services2.arcgis.com/CyVvlIiUfRBmMQuu/arcgis/rest/services/Police_Incident_Reports_view/FeatureServer',
    layerId: 0,
    fieldMappings: {
      date: 'Date_Occurred',
      offenseType: 'Offense_Description',
      address: 'Street',
      caseNumber: 'IncidentNumber',
    },
    offenseTypeMapping: {},
    datePeriod: '2019-present',
  },
  // === CONNECTICUT ===
  // Hartford - UNAVAILABLE: GIS server down (404), Open Data Portal page removed
  // {
  //   type: 'arcgis',
  //   name: 'Hartford',
  //   state: 'CT',
  //   stateFips: '09',
  //   countyFips: '09003',
  //   serviceUrl: 'https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Police_Crime_Data/FeatureServer',
  //   layerId: 0,
  //   fieldMappings: { date: 'Date', offenseType: 'UCR_1_Category', address: 'Address', latitude: 'Lat', longitude: 'Long', caseNumber: 'Case_Number' },
  //   offenseTypeMapping: {},
  //   datePeriod: '2005-present',
  // },
];

// === CKAN ENDPOINTS ===
export const CKAN_ENDPOINTS: CKANEndpoint[] = [
  // === WISCONSIN ===
  {
    type: 'ckan',
    name: 'Milwaukee',
    state: 'WI',
    stateFips: '55',
    countyFips: '55079',
    domain: 'data.milwaukee.gov',
    resourceId: '87843297-a6fa-46d4-ba5d-cb342fb2d3bb',
    fieldMappings: {
      date: 'ReportedDateTime',
      offenseType: '_binary_fields',
      latitude: 'RoughY',
      longitude: 'RoughX',
      address: 'Location',
      caseNumber: 'IncidentNum',
    },
    offenseTypeMapping: {},
    datePeriod: '2024-present',
  },
  // === PENNSYLVANIA ===
  {
    type: 'ckan',
    name: 'Pittsburgh',
    state: 'PA',
    stateFips: '42',
    countyFips: '42003',
    domain: 'data.wprdc.org',
    resourceId: '044f2016-1dfd-4ab0-bc1e-065da05fca2e',
    fieldMappings: {
      date: 'INCIDENTTIME',
      offenseType: 'OFFENSES',
      latitude: 'Y',
      longitude: 'X',
      address: 'INCIDENTLOCATION',
      caseNumber: 'CCR',
    },
    offenseTypeMapping: {},
    datePeriod: '2016-2023',
  },
];

// === CARTO ENDPOINTS ===
export const CARTO_ENDPOINTS: CartoEndpoint[] = [
  // === PENNSYLVANIA ===
  {
    type: 'carto',
    name: 'Philadelphia',
    state: 'PA',
    stateFips: '42',
    countyFips: '42101',
    baseUrl: 'https://phl.carto.com/api/v2/sql',
    tableName: 'incidents_part1_part2',
    fieldMappings: {
      date: 'dispatch_date_time',
      offenseType: 'text_general_code',
      latitude: 'point_y',
      longitude: 'point_x',
      address: 'location_block',
      caseNumber: 'dc_key',
    },
    offenseTypeMapping: {},
    datePeriod: '2006-present',
  },
];

export const ALL_ENDPOINTS: CrimeEndpoint[] = [
  ...SOCRATA_ENDPOINTS,
  ...ARCGIS_ENDPOINTS,
  ...CKAN_ENDPOINTS,
  ...CARTO_ENDPOINTS,
];

export function getEndpointByCity(cityName: string): CrimeEndpoint | undefined {
  return ALL_ENDPOINTS.find(
    ep => ep.name.toLowerCase() === cityName.toLowerCase()
  );
}

export function getEndpointsByState(stateAbbr: string): CrimeEndpoint[] {
  return ALL_ENDPOINTS.filter(
    ep => ep.state.toUpperCase() === stateAbbr.toUpperCase()
  );
}

export function normalizeOffenseType(offenseType: string): CrimeMetricKey | null {
  if (!offenseType) return null;
  
  const normalized = offenseType.trim();
  
  if (NIBRS_TO_METRIC[normalized]) {
    return NIBRS_TO_METRIC[normalized];
  }
  
  const lower = normalized.toLowerCase();
  
  if (lower.includes('assault') || lower.includes('battery')) return 'assault_rate';
  if (lower.includes('sex') || lower.includes('rape')) return 'sex_offense_rate';
  if (lower.includes('robbery')) return 'robbery_rate';
  if (lower.includes('theft') || lower.includes('larceny') || lower.includes('shoplifting')) return 'theft_rate';
  if (lower.includes('burglary') || lower.includes('breaking')) return 'burglary_rate';
  if (lower.includes('vehicle') || lower.includes('auto theft') || lower.includes('motor')) return 'vehicle_theft_rate';
  if (lower.includes('vandal') || lower.includes('criminal mischief') || lower.includes('damage')) return 'vandalism_rate';
  if (lower.includes('fraud') || lower.includes('identity')) return 'fraud_rate';
  if (lower.includes('drug') || lower.includes('narcotic')) return 'drug_offense_rate';
  if (lower.includes('weapon') || lower.includes('gun') || lower.includes('firearm')) return 'weapons_offense_rate';
  
  return null;
}

export function listAvailableCities(): void {
  console.log('=== Available Crime Data Sources ===\n');
  
  console.log('Socrata (SODA API):');
  for (const ep of SOCRATA_ENDPOINTS) {
    console.log(`  ${ep.name}, ${ep.state} - ${ep.domain}/resource/${ep.datasetId}`);
  }
  
  console.log('\nArcGIS Hub:');
  for (const ep of ARCGIS_ENDPOINTS) {
    console.log(`  ${ep.name}, ${ep.state} - ${ep.serviceUrl}`);
  }
  
  console.log('\nCKAN:');
  for (const ep of CKAN_ENDPOINTS) {
    console.log(`  ${ep.name}, ${ep.state} - ${ep.domain}/resource/${ep.resourceId}`);
  }
  
  console.log('\nCarto:');
  for (const ep of CARTO_ENDPOINTS) {
    console.log(`  ${ep.name}, ${ep.state} - ${ep.baseUrl} (${ep.tableName})`);
  }
  
  console.log(`\nTotal: ${ALL_ENDPOINTS.length} cities`);
  console.log(`  Socrata: ${SOCRATA_ENDPOINTS.length}`);
  console.log(`  ArcGIS: ${ARCGIS_ENDPOINTS.length}`);
  console.log(`  CKAN: ${CKAN_ENDPOINTS.length}`);
  console.log(`  Carto: ${CARTO_ENDPOINTS.length}`);
  
  const stateGroups = ALL_ENDPOINTS.reduce((acc, ep) => {
    if (!acc[ep.state]) acc[ep.state] = [];
    acc[ep.state].push(ep.name);
    return acc;
  }, {} as Record<string, string[]>);
  
  console.log('\nBy State:');
  for (const [state, cities] of Object.entries(stateGroups).sort()) {
    console.log(`  ${state}: ${cities.join(', ')}`);
  }
}
