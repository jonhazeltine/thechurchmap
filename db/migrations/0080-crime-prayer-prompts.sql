-- Crime/Safety Prayer Prompts Migration
-- Adds emotive prayer prompts for public safety metrics to match existing health prompts

-- =====================================================================
-- ASSAULT RATE PROMPTS
-- =====================================================================
INSERT INTO prayer_prompt_types (metric_key, category, need_description, prayer_template, severity_levels) VALUES
('assault_rate', 'public_safety', 'Violent incidents have impacted families in this community', 'Lord, we pray for peace in {area_name}. Protect those who have been harmed and bring healing to victims of violence. Transform hearts and break cycles of aggression.', ARRAY['concerning', 'critical', 'very_critical']),
('assault_rate', 'public_safety', 'Residents here have experienced violence in their neighborhood', 'Father, we lift up the families in {area_name} affected by violence. Bring comfort to those who are afraid and justice where it is needed. Send Your peace.', ARRAY['concerning', 'critical', 'very_critical']),
('assault_rate', 'public_safety', 'Safety concerns weigh on families living in this area', 'God, we ask for Your protection over {area_name}. Guard the vulnerable, restrain those who would do harm, and raise up peacemakers in this community.', ARRAY['concerning', 'critical', 'very_critical']),
('assault_rate', 'public_safety', 'Many neighbors here carry the trauma of violence', 'Heavenly Father, heal the wounds—visible and invisible—carried by residents of {area_name}. Restore what violence has stolen and bring reconciliation.', ARRAY['critical', 'very_critical']),
('assault_rate', 'public_safety', 'The threat of violence affects daily life in this neighborhood', 'Lord, we pray against the spirit of violence in {area_name}. Bring transformation to those caught in cycles of harm and protection to the innocent.', ARRAY['critical', 'very_critical']);

-- =====================================================================
-- THEFT RATE PROMPTS
-- =====================================================================
INSERT INTO prayer_prompt_types (metric_key, category, need_description, prayer_template, severity_levels) VALUES
('theft_rate', 'public_safety', 'Property theft has affected many households here', 'Lord, we pray for those in {area_name} who have lost possessions to theft. Restore what was taken and ease the sense of violation they feel.', ARRAY['concerning', 'critical', 'very_critical']),
('theft_rate', 'public_safety', 'Neighbors here worry about the security of their belongings', 'Father, bring peace of mind to residents of {area_name} living with the fear of theft. Protect their homes and vehicles from those who would steal.', ARRAY['concerning', 'critical', 'very_critical']),
('theft_rate', 'public_safety', 'Theft has disrupted the sense of safety in this community', 'God, we lift up {area_name} where theft has broken trust between neighbors. Restore community bonds and bring transformation to those who steal.', ARRAY['concerning', 'critical', 'very_critical']),
('theft_rate', 'public_safety', 'Many families here have experienced the loss of their property', 'Heavenly Father, comfort those in {area_name} who have been victimized by theft. Meet their material needs and heal their sense of security.', ARRAY['critical', 'very_critical']);

-- =====================================================================
-- BURGLARY RATE PROMPTS
-- =====================================================================
INSERT INTO prayer_prompt_types (metric_key, category, need_description, prayer_template, severity_levels) VALUES
('burglary_rate', 'public_safety', 'Home break-ins have shaken this community', 'Lord, we pray for the families in {area_name} whose homes have been broken into. Restore their sense of safety and protect them from further harm.', ARRAY['concerning', 'critical', 'very_critical']),
('burglary_rate', 'public_safety', 'Residents here live with the fear of home invasion', 'Father, we lift up those in {area_name} who feel unsafe in their own homes. Station Your angels of protection around their dwellings.', ARRAY['concerning', 'critical', 'very_critical']),
('burglary_rate', 'public_safety', 'Break-ins have violated the sanctity of homes in this neighborhood', 'God, homes should be places of refuge. We pray for {area_name} where burglary has stolen that peace. Restore and protect these households.', ARRAY['concerning', 'critical', 'very_critical']),
('burglary_rate', 'public_safety', 'Families here have lost more than possessions to burglary', 'Heavenly Father, heal the trauma of those in {area_name} whose homes were invaded. Replace fear with peace and violation with restoration.', ARRAY['critical', 'very_critical']);

-- =====================================================================
-- VANDALISM RATE PROMPTS
-- =====================================================================
INSERT INTO prayer_prompt_types (metric_key, category, need_description, prayer_template, severity_levels) VALUES
('vandalism_rate', 'public_safety', 'Property destruction has marred this neighborhood', 'Lord, we pray for {area_name} where vandalism has left its mark. Bring restoration to damaged property and transformation to those who destroy.', ARRAY['concerning', 'critical', 'very_critical']),
('vandalism_rate', 'public_safety', 'Acts of destruction affect the appearance and spirit of this community', 'Father, we lift up {area_name} suffering from vandalism. Raise up residents who take pride in their neighborhood and discourage destructive behavior.', ARRAY['concerning', 'critical', 'very_critical']),
('vandalism_rate', 'public_safety', 'Vandalism has damaged homes and businesses in this area', 'God, we pray for property owners in {area_name} dealing with the cost and frustration of vandalism. Provide resources for repair and prevention.', ARRAY['concerning', 'critical', 'very_critical']),
('vandalism_rate', 'public_safety', 'Senseless destruction has discouraged residents here', 'Heavenly Father, breathe new hope into {area_name} where vandalism has taken a toll. Turn destruction into opportunity for community beautification.', ARRAY['critical', 'very_critical']);

-- =====================================================================
-- ROBBERY RATE PROMPTS
-- =====================================================================
INSERT INTO prayer_prompt_types (metric_key, category, need_description, prayer_template, severity_levels) VALUES
('robbery_rate', 'public_safety', 'Residents here have faced frightening confrontations', 'Lord, we pray for those in {area_name} who have been robbed and traumatized. Heal their fear and restore their sense of safety in public spaces.', ARRAY['concerning', 'critical', 'very_critical']),
('robbery_rate', 'public_safety', 'The threat of robbery affects how people move through this neighborhood', 'Father, we lift up {area_name} where residents fear being robbed. Protect those walking, working, and living here from violent theft.', ARRAY['concerning', 'critical', 'very_critical']),
('robbery_rate', 'public_safety', 'Armed robbery has traumatized members of this community', 'God, we pray for victims of robbery in {area_name}. Heal the psychological wounds left by these terrifying encounters.', ARRAY['concerning', 'critical', 'very_critical']),
('robbery_rate', 'public_safety', 'People here have been targeted and threatened for their belongings', 'Heavenly Father, bring justice and healing to {area_name} where robbery has left people feeling unsafe. Protect the vulnerable.', ARRAY['critical', 'very_critical']);

-- =====================================================================
-- DRUG OFFENSE RATE PROMPTS
-- =====================================================================
INSERT INTO prayer_prompt_types (metric_key, category, need_description, prayer_template, severity_levels) VALUES
('drug_offense_rate', 'public_safety', 'Drug activity has taken hold in parts of this community', 'Lord, we pray for freedom from addiction in {area_name}. Bring recovery resources, break chains of dependency, and heal families torn apart by drugs.', ARRAY['concerning', 'critical', 'very_critical']),
('drug_offense_rate', 'public_safety', 'Substance abuse affects many families in this neighborhood', 'Father, we lift up those in {area_name} trapped in addiction. Send help, hope, and the path to recovery. Protect children from exposure.', ARRAY['concerning', 'critical', 'very_critical']),
('drug_offense_rate', 'public_safety', 'The impact of drugs reaches into homes and streets here', 'God, we pray against the destruction drugs bring to {area_name}. Shut down trafficking, heal the addicted, and restore broken families.', ARRAY['concerning', 'critical', 'very_critical']),
('drug_offense_rate', 'public_safety', 'Drug-related problems have disrupted neighborhood life here', 'Heavenly Father, bring transformation to {area_name} where drugs have taken root. Raise up recovery programs and support systems.', ARRAY['critical', 'very_critical']),
('drug_offense_rate', 'public_safety', 'Children in this area are exposed to the effects of drug activity', 'Lord, protect the children of {area_name} from the influence of drug activity. Surround them with positive role models and safe environments.', ARRAY['critical', 'very_critical']);

-- =====================================================================
-- WEAPONS OFFENSE RATE PROMPTS
-- =====================================================================
INSERT INTO prayer_prompt_types (metric_key, category, need_description, prayer_template, severity_levels) VALUES
('weapons_offense_rate', 'public_safety', 'Weapons have been used to threaten safety in this community', 'Lord, we pray for {area_name} where weapons have brought fear. Disarm those who would harm others and protect the innocent from violence.', ARRAY['concerning', 'critical', 'very_critical']),
('weapons_offense_rate', 'public_safety', 'Gun violence has touched lives in this neighborhood', 'Father, we lift up the victims of gun violence in {area_name}. Comfort the grieving, heal the wounded, and bring an end to this violence.', ARRAY['concerning', 'critical', 'very_critical']),
('weapons_offense_rate', 'public_safety', 'The presence of weapons creates fear among residents here', 'God, we pray for peace in {area_name} where weapons threaten daily safety. Remove instruments of violence and transform hearts toward peace.', ARRAY['concerning', 'critical', 'very_critical']),
('weapons_offense_rate', 'public_safety', 'Armed incidents have traumatized this community', 'Heavenly Father, heal the trauma caused by weapons violence in {area_name}. Bring comfort, justice, and lasting safety to these streets.', ARRAY['critical', 'very_critical']);
