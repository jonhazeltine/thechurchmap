/**
 * One-time script to add crime prayer prompts to Supabase
 * Run with: npx tsx scripts/run-crime-prompts-migration.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const crimePrompts = [
  // ASSAULT RATE
  { metric_key: 'assault_rate', category: 'public_safety', need_description: 'Violent incidents have impacted families in this community', prayer_template: 'Lord, we pray for peace in {area_name}. Protect those who have been harmed and bring healing to victims of violence. Transform hearts and break cycles of aggression.', severity_levels: ['concerning', 'critical', 'very_critical'] },
  { metric_key: 'assault_rate', category: 'public_safety', need_description: 'Residents here have experienced violence in their neighborhood', prayer_template: 'Father, we lift up the families in {area_name} affected by violence. Bring comfort to those who are afraid and justice where it is needed. Send Your peace.', severity_levels: ['concerning', 'critical', 'very_critical'] },
  { metric_key: 'assault_rate', category: 'public_safety', need_description: 'Safety concerns weigh on families living in this area', prayer_template: 'God, we ask for Your protection over {area_name}. Guard the vulnerable, restrain those who would do harm, and raise up peacemakers in this community.', severity_levels: ['concerning', 'critical', 'very_critical'] },
  { metric_key: 'assault_rate', category: 'public_safety', need_description: 'Many neighbors here carry the trauma of violence', prayer_template: 'Heavenly Father, heal the wounds—visible and invisible—carried by residents of {area_name}. Restore what violence has stolen and bring reconciliation.', severity_levels: ['critical', 'very_critical'] },
  { metric_key: 'assault_rate', category: 'public_safety', need_description: 'The threat of violence affects daily life in this neighborhood', prayer_template: 'Lord, we pray against the spirit of violence in {area_name}. Bring transformation to those caught in cycles of harm and protection to the innocent.', severity_levels: ['critical', 'very_critical'] },

  // THEFT RATE
  { metric_key: 'theft_rate', category: 'public_safety', need_description: 'Property theft has affected many households here', prayer_template: 'Lord, we pray for those in {area_name} who have lost possessions to theft. Restore what was taken and ease the sense of violation they feel.', severity_levels: ['concerning', 'critical', 'very_critical'] },
  { metric_key: 'theft_rate', category: 'public_safety', need_description: 'Neighbors here worry about the security of their belongings', prayer_template: 'Father, bring peace of mind to residents of {area_name} living with the fear of theft. Protect their homes and vehicles from those who would steal.', severity_levels: ['concerning', 'critical', 'very_critical'] },
  { metric_key: 'theft_rate', category: 'public_safety', need_description: 'Theft has disrupted the sense of safety in this community', prayer_template: 'God, we lift up {area_name} where theft has broken trust between neighbors. Restore community bonds and bring transformation to those who steal.', severity_levels: ['concerning', 'critical', 'very_critical'] },
  { metric_key: 'theft_rate', category: 'public_safety', need_description: 'Many families here have experienced the loss of their property', prayer_template: 'Heavenly Father, comfort those in {area_name} who have been victimized by theft. Meet their material needs and heal their sense of security.', severity_levels: ['critical', 'very_critical'] },

  // BURGLARY RATE
  { metric_key: 'burglary_rate', category: 'public_safety', need_description: 'Home break-ins have shaken this community', prayer_template: 'Lord, we pray for the families in {area_name} whose homes have been broken into. Restore their sense of safety and protect them from further harm.', severity_levels: ['concerning', 'critical', 'very_critical'] },
  { metric_key: 'burglary_rate', category: 'public_safety', need_description: 'Residents here live with the fear of home invasion', prayer_template: 'Father, we lift up those in {area_name} who feel unsafe in their own homes. Station Your angels of protection around their dwellings.', severity_levels: ['concerning', 'critical', 'very_critical'] },
  { metric_key: 'burglary_rate', category: 'public_safety', need_description: 'Break-ins have violated the sanctity of homes in this neighborhood', prayer_template: 'God, homes should be places of refuge. We pray for {area_name} where burglary has stolen that peace. Restore and protect these households.', severity_levels: ['concerning', 'critical', 'very_critical'] },
  { metric_key: 'burglary_rate', category: 'public_safety', need_description: 'Families here have lost more than possessions to burglary', prayer_template: 'Heavenly Father, heal the trauma of those in {area_name} whose homes were invaded. Replace fear with peace and violation with restoration.', severity_levels: ['critical', 'very_critical'] },

  // VANDALISM RATE
  { metric_key: 'vandalism_rate', category: 'public_safety', need_description: 'Property destruction has marred this neighborhood', prayer_template: 'Lord, we pray for {area_name} where vandalism has left its mark. Bring restoration to damaged property and transformation to those who destroy.', severity_levels: ['concerning', 'critical', 'very_critical'] },
  { metric_key: 'vandalism_rate', category: 'public_safety', need_description: 'Acts of destruction affect the appearance and spirit of this community', prayer_template: 'Father, we lift up {area_name} suffering from vandalism. Raise up residents who take pride in their neighborhood and discourage destructive behavior.', severity_levels: ['concerning', 'critical', 'very_critical'] },
  { metric_key: 'vandalism_rate', category: 'public_safety', need_description: 'Vandalism has damaged homes and businesses in this area', prayer_template: 'God, we pray for property owners in {area_name} dealing with the cost and frustration of vandalism. Provide resources for repair and prevention.', severity_levels: ['concerning', 'critical', 'very_critical'] },
  { metric_key: 'vandalism_rate', category: 'public_safety', need_description: 'Senseless destruction has discouraged residents here', prayer_template: 'Heavenly Father, breathe new hope into {area_name} where vandalism has taken a toll. Turn destruction into opportunity for community beautification.', severity_levels: ['critical', 'very_critical'] },

  // ROBBERY RATE
  { metric_key: 'robbery_rate', category: 'public_safety', need_description: 'Residents here have faced frightening confrontations', prayer_template: 'Lord, we pray for those in {area_name} who have been robbed and traumatized. Heal their fear and restore their sense of safety in public spaces.', severity_levels: ['concerning', 'critical', 'very_critical'] },
  { metric_key: 'robbery_rate', category: 'public_safety', need_description: 'The threat of robbery affects how people move through this neighborhood', prayer_template: 'Father, we lift up {area_name} where residents fear being robbed. Protect those walking, working, and living here from violent theft.', severity_levels: ['concerning', 'critical', 'very_critical'] },
  { metric_key: 'robbery_rate', category: 'public_safety', need_description: 'Armed robbery has traumatized members of this community', prayer_template: 'God, we pray for victims of robbery in {area_name}. Heal the psychological wounds left by these terrifying encounters.', severity_levels: ['concerning', 'critical', 'very_critical'] },
  { metric_key: 'robbery_rate', category: 'public_safety', need_description: 'People here have been targeted and threatened for their belongings', prayer_template: 'Heavenly Father, bring justice and healing to {area_name} where robbery has left people feeling unsafe. Protect the vulnerable.', severity_levels: ['critical', 'very_critical'] },

  // DRUG OFFENSE RATE
  { metric_key: 'drug_offense_rate', category: 'public_safety', need_description: 'Drug activity has taken hold in parts of this community', prayer_template: 'Lord, we pray for freedom from addiction in {area_name}. Bring recovery resources, break chains of dependency, and heal families torn apart by drugs.', severity_levels: ['concerning', 'critical', 'very_critical'] },
  { metric_key: 'drug_offense_rate', category: 'public_safety', need_description: 'Substance abuse affects many families in this neighborhood', prayer_template: 'Father, we lift up those in {area_name} trapped in addiction. Send help, hope, and the path to recovery. Protect children from exposure.', severity_levels: ['concerning', 'critical', 'very_critical'] },
  { metric_key: 'drug_offense_rate', category: 'public_safety', need_description: 'The impact of drugs reaches into homes and streets here', prayer_template: 'God, we pray against the destruction drugs bring to {area_name}. Shut down trafficking, heal the addicted, and restore broken families.', severity_levels: ['concerning', 'critical', 'very_critical'] },
  { metric_key: 'drug_offense_rate', category: 'public_safety', need_description: 'Drug-related problems have disrupted neighborhood life here', prayer_template: 'Heavenly Father, bring transformation to {area_name} where drugs have taken root. Raise up recovery programs and support systems.', severity_levels: ['critical', 'very_critical'] },
  { metric_key: 'drug_offense_rate', category: 'public_safety', need_description: 'Children in this area are exposed to the effects of drug activity', prayer_template: 'Lord, protect the children of {area_name} from the influence of drug activity. Surround them with positive role models and safe environments.', severity_levels: ['critical', 'very_critical'] },

  // WEAPONS OFFENSE RATE
  { metric_key: 'weapons_offense_rate', category: 'public_safety', need_description: 'Weapons have been used to threaten safety in this community', prayer_template: 'Lord, we pray for {area_name} where weapons have brought fear. Disarm those who would harm others and protect the innocent from violence.', severity_levels: ['concerning', 'critical', 'very_critical'] },
  { metric_key: 'weapons_offense_rate', category: 'public_safety', need_description: 'Gun violence has touched lives in this neighborhood', prayer_template: 'Father, we lift up the victims of gun violence in {area_name}. Comfort the grieving, heal the wounded, and bring an end to this violence.', severity_levels: ['concerning', 'critical', 'very_critical'] },
  { metric_key: 'weapons_offense_rate', category: 'public_safety', need_description: 'The presence of weapons creates fear among residents here', prayer_template: 'God, we pray for peace in {area_name} where weapons threaten daily safety. Remove instruments of violence and transform hearts toward peace.', severity_levels: ['concerning', 'critical', 'very_critical'] },
  { metric_key: 'weapons_offense_rate', category: 'public_safety', need_description: 'Armed incidents have traumatized this community', prayer_template: 'Heavenly Father, heal the trauma caused by weapons violence in {area_name}. Bring comfort, justice, and lasting safety to these streets.', severity_levels: ['critical', 'very_critical'] },
];

async function runMigration() {
  console.log('🚀 Starting crime prayer prompts migration...');
  console.log(`📝 Inserting ${crimePrompts.length} prompts...`);

  // Check for existing crime prompts
  const { data: existing, error: checkError } = await supabase
    .from('prayer_prompt_types')
    .select('id, metric_key')
    .in('metric_key', ['assault_rate', 'theft_rate', 'burglary_rate', 'vandalism_rate', 'robbery_rate', 'drug_offense_rate', 'weapons_offense_rate']);

  if (checkError) {
    console.error('Error checking existing prompts:', checkError);
    process.exit(1);
  }

  if (existing && existing.length > 0) {
    console.log(`⚠️ Found ${existing.length} existing crime prompts. Deleting before re-inserting...`);
    const { error: deleteError } = await supabase
      .from('prayer_prompt_types')
      .delete()
      .in('metric_key', ['assault_rate', 'theft_rate', 'burglary_rate', 'vandalism_rate', 'robbery_rate', 'drug_offense_rate', 'weapons_offense_rate']);
    
    if (deleteError) {
      console.error('Error deleting existing prompts:', deleteError);
      process.exit(1);
    }
    console.log('✅ Deleted existing crime prompts');
  }

  // Insert new prompts
  const { data, error } = await supabase
    .from('prayer_prompt_types')
    .insert(crimePrompts)
    .select();

  if (error) {
    console.error('Error inserting prompts:', error);
    process.exit(1);
  }

  console.log(`✅ Successfully inserted ${data.length} crime prayer prompts!`);
  
  // Verify counts by metric
  const counts: Record<string, number> = {};
  crimePrompts.forEach(p => {
    counts[p.metric_key] = (counts[p.metric_key] || 0) + 1;
  });
  console.log('\n📊 Prompts per metric:');
  Object.entries(counts).forEach(([metric, count]) => {
    console.log(`   ${metric}: ${count} prompts`);
  });
}

runMigration().catch(console.error);
