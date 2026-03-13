/**
 * Metric Categories and Thresholds Configuration
 * 
 * This file defines category mappings and severity thresholds for all health,
 * economic, and social metrics. Thresholds are calibrated against national
 * averages to ensure "critical" means significantly worse than typical.
 * 
 * Data Sources:
 * - CDC PLACES: Health metrics at census tract level
 * - Census ACS: Economic and demographic metrics
 * - Local Crime Data: Public safety metrics (per 100K population)
 * 
 * For methodology details, see /methodology page
 */

import type { HealthSeverityLevel } from './schema';

// =====================================================================
// METRIC CATEGORIES
// =====================================================================
// Categories for diversified prompt selection (one from each category)

export type MetricCategory = 
  | 'family'      // Family structure, children, parenting
  | 'economic'    // Poverty, unemployment, housing costs
  | 'safety'      // Crime, violence, public safety
  | 'health'      // Physical health conditions
  | 'mental'      // Mental health and wellbeing
  | 'access'      // Healthcare access, transportation, utilities
  | 'social'      // Social support, isolation, community
  | 'education'   // Educational attainment
  | 'disability'; // Disabilities and care needs

export const CATEGORY_LABELS: Record<MetricCategory, string> = {
  family: 'Family & Children',
  economic: 'Economic Wellbeing',
  safety: 'Public Safety',
  health: 'Physical Health',
  mental: 'Mental Health',
  access: 'Access & Resources',
  social: 'Social Support',
  education: 'Education',
  disability: 'Disability & Care',
};

// Map each metric to its category
export const METRIC_CATEGORY_MAP: Record<string, MetricCategory> = {
  // === FAMILY ===
  'children_in_single_parent_households': 'family',
  
  // === ECONOMIC ===
  'poverty': 'economic',
  'child_poverty': 'economic',
  'unemployment': 'economic',
  'housing_cost_burden': 'economic',
  'income_inequality': 'economic',
  'food_stamps': 'economic',
  
  // === SAFETY (Crime) ===
  'assault_rate': 'safety',
  'sex_offense_rate': 'safety',
  'robbery_rate': 'safety',
  'theft_rate': 'safety',
  'burglary_rate': 'safety',
  'vehicle_theft_rate': 'safety',
  'vandalism_rate': 'safety',
  'fraud_rate': 'safety',
  'drug_offense_rate': 'safety',
  'weapons_offense_rate': 'safety',
  
  // === PHYSICAL HEALTH ===
  'obesity': 'health',
  'diabetes': 'health',
  'high_blood_pressure': 'health',
  'stroke': 'health',
  'cancer': 'health',
  'copd': 'health',
  'asthma': 'health',
  'cardiovascular_disease': 'health',
  'general_health': 'health',
  'high_cholesterol': 'health',
  'arthritis': 'health',
  'teeth_lost': 'health',
  'frequent_physical_distress': 'health',
  'kidney_disease': 'health',
  'current_smoking': 'health',
  'binge_drinking': 'health',
  'physical_inactivity': 'health',
  'sleep': 'health',
  
  // === MENTAL HEALTH ===
  'depression': 'mental',
  'frequent_mental_distress': 'mental',
  
  // === ACCESS & CLINICAL CARE ===
  'health_insurance': 'access',
  'uninsured': 'access',
  'transportation_barriers': 'access',
  'utility_shutoff_threat': 'access',
  'dental_visit': 'access',
  'routine_checkup': 'access',
  'cholesterol_screening': 'access',
  'colorectal_cancer_screening': 'access',
  'mammography': 'access',
  'taking_bp_medication': 'access',
  'broadband_connection': 'access',
  
  // === SOCIAL ===
  'food_insecurity': 'social',
  'housing_insecurity': 'social',
  'social_isolation': 'social',
  'lack_social_support': 'social',
  
  // === EDUCATION ===
  'high_school_completion': 'education',
  
  // === DISABILITY ===
  'any_disability': 'disability',
  'cognitive_disability': 'disability',
  'hearing_disability': 'disability',
  'mobility_disability': 'disability',
  'vision_disability': 'disability',
  'self_care_disability': 'disability',
  'independent_living_disability': 'disability',
};

// =====================================================================
// THRESHOLD CONFIGURATION
// =====================================================================
// Each metric has thresholds calibrated to national averages
// 'direction': 'negative' = higher values are worse, 'positive' = higher is better

export interface MetricThreshold {
  metric_key: string;
  display: string;
  category: MetricCategory;
  direction: 'negative' | 'positive';
  national_avg: number;      // Approximate national average for reference
  unit: '%' | 'per100k';     // Display unit
  // Thresholds for negative metrics (higher = worse)
  // For positive metrics, these are inverted (lower = worse)
  very_critical: number;
  critical: number;
  concerning: number;
  moderate: number;
  // Below moderate = 'low' (good)
}

// =====================================================================
// CENSUS ACS METRIC THRESHOLDS
// =====================================================================
// Based on American Community Survey national averages

export const CENSUS_ACS_THRESHOLDS: MetricThreshold[] = [
  // === FAMILY ===
  {
    metric_key: 'children_in_single_parent_households',
    display: 'Children in Single-Parent Households',
    category: 'family',
    direction: 'negative',
    national_avg: 35,  // ~35% nationally
    unit: '%',
    very_critical: 55, // 20+ points above national
    critical: 45,
    concerning: 38,    // Slightly above national
    moderate: 30,
  },
  
  // === ECONOMIC ===
  {
    metric_key: 'poverty',
    display: 'Poverty Rate',
    category: 'economic',
    direction: 'negative',
    national_avg: 12,  // ~12% nationally
    unit: '%',
    very_critical: 30,
    critical: 22,
    concerning: 16,
    moderate: 10,
  },
  {
    metric_key: 'child_poverty',
    display: 'Child Poverty Rate',
    category: 'economic',
    direction: 'negative',
    national_avg: 16,  // ~16% nationally
    unit: '%',
    very_critical: 40,
    critical: 30,
    concerning: 22,
    moderate: 14,
  },
  {
    metric_key: 'unemployment',
    display: 'Unemployment Rate',
    category: 'economic',
    direction: 'negative',
    national_avg: 4,  // ~4% in good times
    unit: '%',
    very_critical: 12,
    critical: 8,
    concerning: 6,
    moderate: 4,
  },
  {
    metric_key: 'housing_cost_burden',
    display: 'Housing Cost Burden',
    category: 'economic',
    direction: 'negative',
    national_avg: 30,  // ~30% nationally
    unit: '%',
    very_critical: 50,
    critical: 42,
    concerning: 35,
    moderate: 28,
  },
  
  // === ACCESS ===
  {
    metric_key: 'uninsured',
    display: 'Uninsured Rate',
    category: 'access',
    direction: 'negative',
    national_avg: 8,  // ~8% nationally
    unit: '%',
    very_critical: 20,
    critical: 15,
    concerning: 11,
    moderate: 7,
  },
  
  // === EDUCATION ===
  {
    metric_key: 'high_school_completion',
    display: 'High School Completion',
    category: 'education',
    direction: 'positive',  // Higher is better!
    national_avg: 88,  // ~88% nationally
    unit: '%',
    very_critical: 70,  // These are MINIMUMS for positive metrics
    critical: 78,
    concerning: 82,
    moderate: 86,
  },
  
  // === DEMOGRAPHIC (Positive - diversity shown as opportunity) ===
  {
    metric_key: 'racial_ethnic_diversity',
    display: 'Racial/Ethnic Diversity',
    category: 'social',
    direction: 'positive',  // Higher diversity = greener (ministry opportunity)
    national_avg: 40,  // ~40% non-white nationally
    unit: '%',
    // For positive metrics, these are MINIMUMS (values below = worse colors)
    very_critical: 5,   // <5% = red (very low diversity)
    critical: 15,       // 5-15% = orange
    concerning: 25,     // 15-25% = yellow
    moderate: 40,       // 25-40% = yellow-green, >40% = green
  },
];

// =====================================================================
// CDC PLACES HEALTH METRIC THRESHOLDS
// =====================================================================
// Based on CDC PLACES national averages at census tract level

export const CDC_PLACES_THRESHOLDS: MetricThreshold[] = [
  // === PHYSICAL HEALTH ===
  {
    metric_key: 'obesity',
    display: 'Obesity',
    category: 'health',
    direction: 'negative',
    national_avg: 33,  // ~33% nationally
    unit: '%',
    very_critical: 45,
    critical: 40,
    concerning: 36,
    moderate: 30,
  },
  {
    metric_key: 'diabetes',
    display: 'Diabetes',
    category: 'health',
    direction: 'negative',
    national_avg: 11,  // ~11% nationally
    unit: '%',
    very_critical: 18,
    critical: 15,
    concerning: 13,
    moderate: 10,
  },
  {
    metric_key: 'high_blood_pressure',
    display: 'High Blood Pressure',
    category: 'health',
    direction: 'negative',
    national_avg: 33,  // ~33% nationally
    unit: '%',
    very_critical: 48,
    critical: 42,
    concerning: 38,
    moderate: 32,
  },
  {
    metric_key: 'stroke',
    display: 'Stroke',
    category: 'health',
    direction: 'negative',
    national_avg: 3,
    unit: '%',
    very_critical: 7,
    critical: 5,
    concerning: 4,
    moderate: 3,
  },
  {
    metric_key: 'cardiovascular_disease',
    display: 'Heart Disease',
    category: 'health',
    direction: 'negative',
    national_avg: 6,
    unit: '%',
    very_critical: 12,
    critical: 9,
    concerning: 7,
    moderate: 5,
  },
  {
    metric_key: 'copd',
    display: 'COPD',
    category: 'health',
    direction: 'negative',
    national_avg: 6,
    unit: '%',
    very_critical: 12,
    critical: 9,
    concerning: 7,
    moderate: 5,
  },
  {
    metric_key: 'asthma',
    display: 'Asthma',
    category: 'health',
    direction: 'negative',
    national_avg: 10,
    unit: '%',
    very_critical: 16,
    critical: 14,
    concerning: 12,
    moderate: 9,
  },
  {
    metric_key: 'cancer',
    display: 'Cancer (non-skin)',
    category: 'health',
    direction: 'negative',
    national_avg: 8.5,  // CDC PLACES 2023 data shows ~8-9% is typical
    unit: '%',
    very_critical: 14,  // Only the highest 95th+ percentile
    critical: 12,
    concerning: 10,
    moderate: 7,
  },
  {
    metric_key: 'general_health',
    display: 'Fair/Poor Health',
    category: 'health',
    direction: 'negative',
    national_avg: 17,  // ~17% report fair/poor health
    unit: '%',
    very_critical: 30,
    critical: 25,
    concerning: 20,
    moderate: 15,
  },
  {
    metric_key: 'high_cholesterol',
    display: 'High Cholesterol',
    category: 'health',
    direction: 'negative',
    national_avg: 36,  // CDC data shows 31-45%, typical ~36%
    unit: '%',
    very_critical: 48,
    critical: 44,
    concerning: 40,
    moderate: 34,
  },
  {
    metric_key: 'arthritis',
    display: 'Arthritis',
    category: 'health',
    direction: 'negative',
    national_avg: 32,  // CDC data shows 25-43%, typical ~32%
    unit: '%',
    very_critical: 45,
    critical: 40,
    concerning: 36,
    moderate: 28,
  },
  {
    metric_key: 'teeth_lost',
    display: 'All Teeth Lost (65+)',
    category: 'health',
    direction: 'negative',
    national_avg: 12,  // CDC data shows 3-38%, typical ~12%
    unit: '%',
    very_critical: 25,
    critical: 18,
    concerning: 14,
    moderate: 9,
  },
  {
    metric_key: 'frequent_physical_distress',
    display: 'Frequent Physical Distress',
    category: 'health',
    direction: 'negative',
    national_avg: 14,  // CDC data shows 11-24%, typical ~14%
    unit: '%',
    very_critical: 22,
    critical: 18,
    concerning: 16,
    moderate: 12,
  },
  {
    metric_key: 'kidney_disease',
    display: 'Kidney Disease',
    category: 'health',
    direction: 'negative',
    national_avg: 3,  // Typically low prevalence
    unit: '%',
    very_critical: 6,
    critical: 5,
    concerning: 4,
    moderate: 2.5,
  },
  {
    metric_key: 'current_smoking',
    display: 'Current Smoking',
    category: 'health',
    direction: 'negative',
    national_avg: 12,  // ~12% nationally
    unit: '%',
    very_critical: 25,
    critical: 20,
    concerning: 16,
    moderate: 11,
  },
  {
    metric_key: 'binge_drinking',
    display: 'Binge Drinking',
    category: 'health',
    direction: 'negative',
    national_avg: 16,  // ~16% nationally
    unit: '%',
    very_critical: 26,
    critical: 22,
    concerning: 18,
    moderate: 14,
  },
  {
    metric_key: 'physical_inactivity',
    display: 'Physical Inactivity',
    category: 'health',
    direction: 'negative',
    national_avg: 23,  // ~23% nationally
    unit: '%',
    very_critical: 38,
    critical: 32,
    concerning: 27,
    moderate: 21,
  },
  {
    metric_key: 'sleep',
    display: 'Short Sleep (<7 hours)',
    category: 'health',
    direction: 'negative',
    national_avg: 35,  // ~35% nationally
    unit: '%',
    very_critical: 48,
    critical: 42,
    concerning: 38,
    moderate: 33,
  },
  
  // === MENTAL HEALTH ===
  {
    metric_key: 'depression',
    display: 'Depression',
    category: 'mental',
    direction: 'negative',
    national_avg: 20,  // ~20% nationally
    unit: '%',
    very_critical: 32,
    critical: 27,
    concerning: 23,
    moderate: 18,
  },
  {
    metric_key: 'frequent_mental_distress',
    display: 'Frequent Mental Distress',
    category: 'mental',
    direction: 'negative',
    national_avg: 15,  // ~15% nationally (14+ days/month)
    unit: '%',
    very_critical: 25,
    critical: 21,
    concerning: 18,
    moderate: 14,
  },
  
  // === SOCIAL NEEDS ===
  {
    metric_key: 'food_insecurity',
    display: 'Food Insecurity',
    category: 'social',
    direction: 'negative',
    national_avg: 12,  // ~12% nationally
    unit: '%',
    very_critical: 25,
    critical: 20,
    concerning: 15,
    moderate: 10,
  },
  {
    metric_key: 'housing_insecurity',
    display: 'Housing Insecurity',
    category: 'social',
    direction: 'negative',
    national_avg: 12,
    unit: '%',
    very_critical: 25,
    critical: 20,
    concerning: 15,
    moderate: 10,
  },
  {
    metric_key: 'social_isolation',
    display: 'Social Isolation',
    category: 'social',
    direction: 'negative',
    national_avg: 20,
    unit: '%',
    very_critical: 40,
    critical: 32,
    concerning: 25,
    moderate: 18,
  },
  {
    metric_key: 'lack_social_support',
    display: 'Lack of Social Support',
    category: 'social',
    direction: 'negative',
    national_avg: 22,  // CDC SDOH data: 17-29%, typical ~22%
    unit: '%',
    very_critical: 35,
    critical: 30,
    concerning: 26,
    moderate: 19,
  },
  {
    metric_key: 'utility_shutoff_threat',
    display: 'Utility Shutoff Threat',
    category: 'access',
    direction: 'negative',
    national_avg: 8,
    unit: '%',
    very_critical: 18,
    critical: 14,
    concerning: 10,
    moderate: 6,
  },
  {
    metric_key: 'transportation_barriers',
    display: 'Transportation Barriers',
    category: 'access',
    direction: 'negative',
    national_avg: 10,
    unit: '%',
    very_critical: 22,
    critical: 17,
    concerning: 13,
    moderate: 8,
  },
  
  // === ACCESS / CLINICAL CARE ===
  // Note: These are POSITIVE metrics - higher screening rates are better
  // Thresholds calibrated from CDC PLACES 2023 data
  {
    metric_key: 'health_insurance',
    display: 'Uninsured Adults',
    category: 'access',
    direction: 'negative',
    national_avg: 10,
    unit: '%',
    very_critical: 22,
    critical: 17,
    concerning: 13,
    moderate: 9,
  },
  {
    metric_key: 'routine_checkup',
    display: 'Annual Checkup',
    category: 'access',
    direction: 'positive',  // Higher is better
    national_avg: 80,  // CDC data shows 76-85%, typical ~80%
    unit: '%',
    very_critical: 70,  // For positive: thresholds are MINIMUMS
    critical: 74,
    concerning: 77,
    moderate: 82,
  },
  {
    metric_key: 'dental_visit',
    display: 'Dental Visit',
    category: 'access',
    direction: 'positive',  // Higher is better
    national_avg: 68,  // CDC data shows 59-81%, typical ~68%
    unit: '%',
    very_critical: 55,
    critical: 60,
    concerning: 64,
    moderate: 70,
  },
  {
    metric_key: 'cholesterol_screening',
    display: 'Cholesterol Screening',
    category: 'access',
    direction: 'positive',  // Higher is better
    national_avg: 87,  // CDC data shows 77-93%, typical ~87%
    unit: '%',
    very_critical: 75,
    critical: 80,
    concerning: 84,
    moderate: 88,
  },
  {
    metric_key: 'colorectal_cancer_screening',
    display: 'Colorectal Cancer Screening',
    category: 'access',
    direction: 'positive',  // Higher is better
    national_avg: 72,  // CDC data shows 66-79%, typical ~72%
    unit: '%',
    very_critical: 62,
    critical: 66,
    concerning: 69,
    moderate: 74,
  },
  {
    metric_key: 'mammography',
    display: 'Mammography Screening',
    category: 'access',
    direction: 'positive',  // Higher is better
    national_avg: 77,  // CDC data shows 68-81%, typical ~77%
    unit: '%',
    very_critical: 65,
    critical: 70,
    concerning: 74,
    moderate: 78,
  },
  {
    metric_key: 'taking_bp_medication',
    display: 'Taking BP Medication',
    category: 'access',
    direction: 'positive',  // Higher is better (compliance)
    national_avg: 78,  // CDC data shows 73-84%, typical ~78%
    unit: '%',
    very_critical: 68,
    critical: 72,
    concerning: 75,
    moderate: 79,
  },
  
  // === DISABILITY ===
  // Thresholds calibrated from CDC PLACES 2023 data
  {
    metric_key: 'any_disability',
    display: 'Any Disability',
    category: 'disability',
    direction: 'negative',
    national_avg: 30,  // CDC data shows 26-37%, typical ~30%
    unit: '%',
    very_critical: 42,
    critical: 38,
    concerning: 34,
    moderate: 26,
  },
  {
    metric_key: 'cognitive_disability',
    display: 'Cognitive Disability',
    category: 'disability',
    direction: 'negative',
    national_avg: 14,  // CDC data shows 10-27%, typical ~14%
    unit: '%',
    very_critical: 24,
    critical: 20,
    concerning: 17,
    moderate: 11,
  },
  {
    metric_key: 'hearing_disability',
    display: 'Hearing Disability',
    category: 'disability',
    direction: 'negative',
    national_avg: 8,  // CDC data shows 6-13%, typical ~8%
    unit: '%',
    very_critical: 14,
    critical: 12,
    concerning: 10,
    moderate: 6,
  },
  {
    metric_key: 'mobility_disability',
    display: 'Mobility Disability',
    category: 'disability',
    direction: 'negative',
    national_avg: 16,  // CDC data shows 10-23%, typical ~16%
    unit: '%',
    very_critical: 26,
    critical: 22,
    concerning: 19,
    moderate: 12,
  },
  {
    metric_key: 'vision_disability',
    display: 'Vision Disability',
    category: 'disability',
    direction: 'negative',
    national_avg: 5,  // CDC data shows 3-6%, typical ~5%
    unit: '%',
    very_critical: 9,
    critical: 7,
    concerning: 6,
    moderate: 4,
  },
  {
    metric_key: 'self_care_disability',
    display: 'Self-Care Disability',
    category: 'disability',
    direction: 'negative',
    national_avg: 4,  // CDC data shows 2-10%, typical ~4%
    unit: '%',
    very_critical: 8,
    critical: 6,
    concerning: 5,
    moderate: 3,
  },
  {
    metric_key: 'independent_living_disability',
    display: 'Independent Living Disability',
    category: 'disability',
    direction: 'negative',
    national_avg: 9,  // CDC data shows 7-11%, typical ~9%
    unit: '%',
    very_critical: 14,
    critical: 12,
    concerning: 10,
    moderate: 7,
  },
];

// =====================================================================
// CRIME THRESHOLDS (per 100,000 population)
// =====================================================================
// Based on FBI UCR national crime rate distributions

export const CRIME_THRESHOLDS: MetricThreshold[] = [
  {
    metric_key: 'assault_rate',
    display: 'Assault Rate',
    category: 'safety',
    direction: 'negative',
    national_avg: 250,  // ~250 per 100K nationally
    unit: 'per100k',
    very_critical: 800,
    critical: 500,
    concerning: 300,
    moderate: 150,
  },
  {
    metric_key: 'theft_rate',
    display: 'Theft Rate',
    category: 'safety',
    direction: 'negative',
    national_avg: 1500,  // Higher volume crime
    unit: 'per100k',
    very_critical: 4000,
    critical: 2500,
    concerning: 1800,
    moderate: 1000,
  },
  {
    metric_key: 'burglary_rate',
    display: 'Burglary Rate',
    category: 'safety',
    direction: 'negative',
    national_avg: 250,  // FBI 2023: 250.7 per 100K
    unit: 'per100k',
    very_critical: 700,
    critical: 480,
    concerning: 320,
    moderate: 180,
  },
  {
    metric_key: 'robbery_rate',
    display: 'Robbery Rate',
    category: 'safety',
    direction: 'negative',
    national_avg: 80,
    unit: 'per100k',
    very_critical: 300,
    critical: 180,
    concerning: 100,
    moderate: 50,
  },
  {
    metric_key: 'vandalism_rate',
    display: 'Vandalism Rate',
    category: 'safety',
    direction: 'negative',
    national_avg: 400,
    unit: 'per100k',
    very_critical: 1200,
    critical: 800,
    concerning: 500,
    moderate: 250,
  },
  {
    metric_key: 'vehicle_theft_rate',
    display: 'Vehicle Theft Rate',
    category: 'safety',
    direction: 'negative',
    national_avg: 320,  // FBI 2023: 321 per 100K
    unit: 'per100k',
    very_critical: 850,
    critical: 580,
    concerning: 400,
    moderate: 220,
  },
  {
    metric_key: 'drug_offense_rate',
    display: 'Drug Offense Rate',
    category: 'safety',
    direction: 'negative',
    national_avg: 350,
    unit: 'per100k',
    very_critical: 1000,
    critical: 650,
    concerning: 420,
    moderate: 220,
  },
  {
    metric_key: 'weapons_offense_rate',
    display: 'Weapons Offense Rate',
    category: 'safety',
    direction: 'negative',
    national_avg: 50,
    unit: 'per100k',
    very_critical: 180,
    critical: 120,
    concerning: 70,
    moderate: 35,
  },
  {
    metric_key: 'sex_offense_rate',
    display: 'Sex Offense Rate',
    category: 'safety',
    direction: 'negative',
    national_avg: 40,
    unit: 'per100k',
    very_critical: 130,
    critical: 85,
    concerning: 55,
    moderate: 30,
  },
  {
    metric_key: 'fraud_rate',
    display: 'Fraud Rate',
    category: 'safety',
    direction: 'negative',
    national_avg: 100,
    unit: 'per100k',
    very_critical: 350,
    critical: 220,
    concerning: 140,
    moderate: 70,
  },
];

// =====================================================================
// COMBINED THRESHOLDS LOOKUP
// =====================================================================

const ALL_THRESHOLDS = [
  ...CENSUS_ACS_THRESHOLDS,
  ...CDC_PLACES_THRESHOLDS,
  ...CRIME_THRESHOLDS,
];

// Build lookup map for O(1) access
export const METRIC_THRESHOLDS_MAP: Map<string, MetricThreshold> = new Map(
  ALL_THRESHOLDS.map(t => [t.metric_key, t])
);

// All crime metric keys for consistent usage across codebase
export const CRIME_METRIC_KEYS = CRIME_THRESHOLDS.map(t => t.metric_key);

// =====================================================================
// CRIME DATA NORMALIZATION
// =====================================================================
// Crime data was ingested with values ~100x too high (avg=2100 vs expected ~250)
// This function detects and normalizes inflated values using national averages

const CRIME_NORMALIZATION_FACTOR = 0.01; // Divide by 100

/**
 * Check if a metric is a crime rate metric
 */
export function isCrimeMetric(metricKey: string): boolean {
  return CRIME_METRIC_KEYS.includes(metricKey);
}

/**
 * Normalize crime data that may have been ingested at inflated scale
 * Detection: If value > 4x national average, it's likely inflated ~100x
 * 
 * @returns { value: normalizedValue, wasNormalized: boolean }
 */
export function normalizeCrimeValue(rawValue: number, metricKey: string): { 
  value: number; 
  wasNormalized: boolean;
} {
  if (!isCrimeMetric(metricKey)) {
    return { value: rawValue, wasNormalized: false };
  }
  
  const threshold = METRIC_THRESHOLDS_MAP.get(metricKey);
  if (!threshold) {
    return { value: rawValue, wasNormalized: false };
  }
  
  const nationalAvg = threshold.national_avg;
  
  // If value is > 4x national average, assume it's inflated ~100x and normalize
  // This handles the ingestion error where rates were calculated incorrectly
  if (rawValue > nationalAvg * 4) {
    return { 
      value: rawValue * CRIME_NORMALIZATION_FACTOR, 
      wasNormalized: true 
    };
  }
  
  return { value: rawValue, wasNormalized: false };
}

/**
 * Get national average for a crime metric
 */
export function getCrimeNationalAverage(metricKey: string): number | null {
  const threshold = METRIC_THRESHOLDS_MAP.get(metricKey);
  if (!threshold || !isCrimeMetric(metricKey)) {
    return null;
  }
  return threshold.national_avg;
}

// =====================================================================
// SEVERITY CALCULATION FUNCTION
// =====================================================================

/**
 * Get severity level for a metric value using calibrated thresholds
 * Falls back to generic thresholds if metric not configured
 */
export function getSeverityLevel(value: number, metricKey: string): HealthSeverityLevel {
  const threshold = METRIC_THRESHOLDS_MAP.get(metricKey);
  
  if (!threshold) {
    // Fallback for unconfigured metrics - use generic thresholds
    // Assume negative direction (higher = worse)
    if (value >= 40) return 'very_critical';
    if (value >= 30) return 'critical';
    if (value >= 20) return 'concerning';
    if (value >= 10) return 'moderate';
    return 'low';
  }
  
  if (threshold.direction === 'negative') {
    // Higher values are worse
    if (value >= threshold.very_critical) return 'very_critical';
    if (value >= threshold.critical) return 'critical';
    if (value >= threshold.concerning) return 'concerning';
    if (value >= threshold.moderate) return 'moderate';
    return 'low';
  } else {
    // Positive direction: lower values are worse (e.g., high school completion)
    if (value <= threshold.very_critical) return 'very_critical';
    if (value <= threshold.critical) return 'critical';
    if (value <= threshold.concerning) return 'concerning';
    if (value <= threshold.moderate) return 'moderate';
    return 'low';
  }
}

/**
 * Get the category for a metric
 */
export function getMetricCategory(metricKey: string): MetricCategory | undefined {
  return METRIC_CATEGORY_MAP[metricKey];
}

/**
 * Get threshold configuration for a metric
 */
export function getMetricThreshold(metricKey: string): MetricThreshold | undefined {
  return METRIC_THRESHOLDS_MAP.get(metricKey);
}

/**
 * Check if a value crosses the concerning threshold for a metric
 */
export function isConcerning(value: number, metricKey: string): boolean {
  const severity = getSeverityLevel(value, metricKey);
  return severity === 'concerning' || severity === 'critical' || severity === 'very_critical';
}

/**
 * Get choropleth color breakpoints for a metric
 * Returns [t1, t2, t3, t4] where:
 * - For negative metrics: color[0] < t1, color[1] < t2, color[2] < t3, color[3] < t4, color[4] >= t4
 * - For positive metrics: color[0] <= t1, color[1] <= t2, color[2] <= t3, color[3] <= t4, color[4] > t4
 * 
 * Returns null if metric has no configured thresholds
 */
export function getChoroplethThresholds(metricKey: string): { 
  breakpoints: [number, number, number, number]; 
  direction: 'negative' | 'positive';
} | null {
  const threshold = METRIC_THRESHOLDS_MAP.get(metricKey);
  
  if (!threshold) {
    return null;
  }
  
  // Return thresholds ordered from low to high severity
  // For negative metrics: moderate < concerning < critical < very_critical
  // For positive metrics: we invert so moderate > concerning > critical > very_critical
  return {
    breakpoints: [
      threshold.moderate,
      threshold.concerning,
      threshold.critical,
      threshold.very_critical,
    ],
    direction: threshold.direction,
  };
}
