-- Prayer Prompt Types Migration
-- Creates a table for health-metric-based prayer prompts that display in Prayer Mode

-- =====================================================================
-- PRAYER PROMPT TYPES TABLE
-- Stores pre-written prayer prompts linked to health metrics
-- =====================================================================

CREATE TABLE IF NOT EXISTS prayer_prompt_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Link to health metric (matches HEALTH_METRIC_KEYS in schema.ts)
  metric_key TEXT NOT NULL,
  
  -- Human-readable description of the need (scrolling ticker text)
  -- e.g., "Children in this area experience food shortage on a regular basis"
  need_description TEXT NOT NULL,
  
  -- The actual prayer prompt template
  -- Supports variables: {area_name}, {church_name}, {metric_value}
  prayer_template TEXT NOT NULL,
  
  -- Which severity levels trigger this prompt (array of: 'low', 'moderate', 'concerning', 'critical', 'very_critical')
  severity_levels TEXT[] NOT NULL DEFAULT ARRAY['concerning', 'critical', 'very_critical'],
  
  -- Weight for randomization (higher = more likely to be selected)
  weight INTEGER NOT NULL DEFAULT 1,
  
  -- Category for grouping (matches metric categories)
  category TEXT NOT NULL,
  
  -- Whether this prompt is active
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Constraints
  CONSTRAINT valid_weight CHECK (weight > 0)
);

-- Index for efficient metric-based lookups
CREATE INDEX IF NOT EXISTS idx_prayer_prompt_types_metric ON prayer_prompt_types(metric_key);
CREATE INDEX IF NOT EXISTS idx_prayer_prompt_types_active ON prayer_prompt_types(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_prayer_prompt_types_category ON prayer_prompt_types(category);

-- Enable RLS
ALTER TABLE prayer_prompt_types ENABLE ROW LEVEL SECURITY;

-- Everyone can read active prompts (public data)
CREATE POLICY "Anyone can read active prayer prompts"
  ON prayer_prompt_types FOR SELECT
  USING (is_active = true);

-- Only super admins can modify prompts
CREATE POLICY "Super admins can manage prayer prompts"
  ON prayer_prompt_types FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'super_admin')::boolean = true
    )
  );

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_prayer_prompt_types_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_prayer_prompt_types_timestamp
  BEFORE UPDATE ON prayer_prompt_types
  FOR EACH ROW
  EXECUTE FUNCTION update_prayer_prompt_types_updated_at();

-- =====================================================================
-- SEED INITIAL PRAYER PROMPTS
-- 4-8 prompts per key ministry-relevant metric
-- =====================================================================

-- FOOD INSECURITY PROMPTS
INSERT INTO prayer_prompt_types (metric_key, category, need_description, prayer_template, severity_levels) VALUES
('food_insecurity', 'social_needs', 'Many families in this neighborhood struggle to put food on the table each day', 'Lord, we lift up the families in {area_name} who face hunger daily. Provide for their needs and guide us to be Your hands and feet in meeting their physical needs.', ARRAY['concerning', 'critical', 'very_critical']),
('food_insecurity', 'social_needs', 'Children in this area often go to bed hungry', 'Heavenly Father, we pray for the children in {area_name} who don''t have enough to eat. Multiply resources like loaves and fishes, and show us how {church_name} can help.', ARRAY['concerning', 'critical', 'very_critical']),
('food_insecurity', 'social_needs', 'This community has limited access to nutritious food', 'God of provision, we ask that You open doors for healthy food options in {area_name}. Bless the food pantries, community gardens, and neighbors who share what they have.', ARRAY['concerning', 'critical', 'very_critical']),
('food_insecurity', 'social_needs', 'Food insecurity affects many households in this region', 'Father, we pray against the spirit of scarcity in {area_name}. Bring abundance where there is lack, and give wisdom to community leaders addressing food access.', ARRAY['concerning', 'critical', 'very_critical']),
('food_insecurity', 'social_needs', 'Some families here must choose between food and other necessities', 'Lord Jesus, You fed the 5,000 with compassion. We ask for that same miraculous provision for families in {area_name} facing impossible choices.', ARRAY['critical', 'very_critical']),
('food_insecurity', 'social_needs', 'Hunger is a daily reality for residents of this area', 'Gracious God, we pray for sustainable solutions to hunger in {area_name}. Raise up advocates, donors, and volunteers to fight food insecurity.', ARRAY['critical', 'very_critical']);

-- POVERTY PROMPTS
INSERT INTO prayer_prompt_types (metric_key, category, need_description, prayer_template, severity_levels) VALUES
('poverty', 'social_economic', 'Many residents here live below the poverty line', 'Lord, we lift up those in {area_name} trapped in cycles of poverty. Open doors of opportunity and provide pathways to financial stability.', ARRAY['concerning', 'critical', 'very_critical']),
('poverty', 'social_economic', 'Economic hardship affects numerous families in this community', 'Father, we pray for job opportunities, fair wages, and financial wisdom for families struggling in {area_name}. Break chains of generational poverty.', ARRAY['concerning', 'critical', 'very_critical']),
('poverty', 'social_economic', 'This neighborhood has higher than average poverty rates', 'God of justice, we ask for economic revival in {area_name}. Bring businesses, jobs, and investment that lifts the whole community.', ARRAY['concerning', 'critical', 'very_critical']),
('poverty', 'social_economic', 'Financial stress weighs heavily on families here', 'Heavenly Father, ease the burden of poverty on {area_name}. Provide unexpected blessings and connect people to resources they need.', ARRAY['concerning', 'critical', 'very_critical']),
('poverty', 'social_economic', 'Many children in this area grow up in poverty', 'Lord, protect the children of {area_name} from the lasting effects of poverty. Surround them with mentors, opportunities, and hope.', ARRAY['critical', 'very_critical']);

-- CHILD POVERTY PROMPTS
INSERT INTO prayer_prompt_types (metric_key, category, need_description, prayer_template, severity_levels) VALUES
('child_poverty', 'social_economic', 'A significant number of children here live in poverty', 'Father, we pray for every child in {area_name} affected by poverty. Provide for their needs and protect their futures.', ARRAY['concerning', 'critical', 'very_critical']),
('child_poverty', 'social_economic', 'Children in this community face economic challenges that affect their wellbeing', 'Lord Jesus, You welcomed the little children. We ask You to wrap Your arms around the children of {area_name} facing hardship.', ARRAY['concerning', 'critical', 'very_critical']),
('child_poverty', 'social_economic', 'Many kids in this neighborhood lack basic resources', 'God, we pray for schools, churches, and organizations serving children in {area_name}. Multiply their resources and impact.', ARRAY['concerning', 'critical', 'very_critical']),
('child_poverty', 'social_economic', 'Economic instability impacts children''s development in this area', 'Heavenly Father, break the cycle of child poverty in {area_name}. Raise up advocates and resources for the most vulnerable.', ARRAY['critical', 'very_critical']);

-- HOUSING INSECURITY PROMPTS
INSERT INTO prayer_prompt_types (metric_key, category, need_description, prayer_template, severity_levels) VALUES
('housing_insecurity', 'social_needs', 'Housing stability is a challenge for many families here', 'Lord, we pray for stable, safe housing for every family in {area_name}. Guide landlords, developers, and policymakers toward just solutions.', ARRAY['concerning', 'critical', 'very_critical']),
('housing_insecurity', 'social_needs', 'Many residents worry about keeping a roof over their heads', 'Father, ease the anxiety of those in {area_name} facing housing uncertainty. Provide safe shelter and peace of mind.', ARRAY['concerning', 'critical', 'very_critical']),
('housing_insecurity', 'social_needs', 'Affordable housing is scarce in this neighborhood', 'God, we ask for affordable housing solutions in {area_name}. Open doors that seem closed and provide homes for the homeless.', ARRAY['concerning', 'critical', 'very_critical']),
('housing_insecurity', 'social_needs', 'Families here face the constant threat of losing their homes', 'Heavenly Father, protect families in {area_name} from eviction and homelessness. Surround them with support and resources.', ARRAY['critical', 'very_critical']),
('housing_insecurity', 'social_needs', 'Unstable housing affects children''s education and wellbeing in this area', 'Lord, we lift up children in {area_name} whose lives are disrupted by housing instability. Provide them with stability and hope.', ARRAY['critical', 'very_critical']);

-- SOCIAL ISOLATION PROMPTS
INSERT INTO prayer_prompt_types (metric_key, category, need_description, prayer_template, severity_levels) VALUES
('social_isolation', 'social_needs', 'Many people in this community feel alone and disconnected', 'Lord, we pray against the epidemic of loneliness in {area_name}. Connect isolated souls to community, friendship, and Your love.', ARRAY['concerning', 'critical', 'very_critical']),
('social_isolation', 'social_needs', 'Isolation and loneliness affect residents of this area', 'Father, send Your people into the lonely places of {area_name}. May {church_name} be a beacon of welcome and belonging.', ARRAY['concerning', 'critical', 'very_critical']),
('social_isolation', 'social_needs', 'Seniors in this neighborhood often lack regular social connection', 'God, we lift up the elderly in {area_name} who feel forgotten. Send visitors, friends, and community to brighten their days.', ARRAY['concerning', 'critical', 'very_critical']),
('social_isolation', 'social_needs', 'Social disconnection is a growing concern in this community', 'Heavenly Father, knit together the people of {area_name} in genuine community. Break down walls of isolation and mistrust.', ARRAY['concerning', 'critical', 'very_critical']);

-- LACK OF SOCIAL SUPPORT PROMPTS
INSERT INTO prayer_prompt_types (metric_key, category, need_description, prayer_template, severity_levels) VALUES
('lack_social_support', 'social_needs', 'Many residents here lack a support network when times get tough', 'Lord, we pray for support systems to grow in {area_name}. Raise up neighbors who care for neighbors and churches that embrace community.', ARRAY['concerning', 'critical', 'very_critical']),
('lack_social_support', 'social_needs', 'People in this area often face hardships alone without help', 'Father, no one should face their struggles alone. Connect those in {area_name} to the support and encouragement they need.', ARRAY['concerning', 'critical', 'very_critical']),
('lack_social_support', 'social_needs', 'Emotional and practical support is hard to find for many here', 'God, be the friend that sticks closer than a brother for those in {area_name} who have no one. Lead them to caring community.', ARRAY['concerning', 'critical', 'very_critical']);

-- DEPRESSION PROMPTS
INSERT INTO prayer_prompt_types (metric_key, category, need_description, prayer_template, severity_levels) VALUES
('depression', 'health_outcomes', 'Depression affects many people in this community', 'Lord, we lift up those in {area_name} battling depression. Bring light into their darkness and connect them with help and hope.', ARRAY['concerning', 'critical', 'very_critical']),
('depression', 'health_outcomes', 'Mental health struggles are common among residents here', 'Heavenly Father, heal the hearts and minds of those suffering in {area_name}. Remove the stigma around mental health and provide resources for healing.', ARRAY['concerning', 'critical', 'very_critical']),
('depression', 'health_outcomes', 'Many people in this area struggle with feelings of hopelessness', 'God of hope, fill {area_name} with Your presence. Drive out despair and replace it with purpose, connection, and joy.', ARRAY['concerning', 'critical', 'very_critical']),
('depression', 'health_outcomes', 'The weight of depression is heavy on this neighborhood', 'Father, we pray against the spirit of depression in {area_name}. Strengthen those who are weary and send messengers of encouragement.', ARRAY['critical', 'very_critical']),
('depression', 'health_outcomes', 'Untreated depression impacts families throughout this area', 'Lord, we ask for accessible mental health services in {area_name}. Equip counselors, pastors, and friends to be agents of healing.', ARRAY['critical', 'very_critical']);

-- FREQUENT MENTAL DISTRESS PROMPTS
INSERT INTO prayer_prompt_types (metric_key, category, need_description, prayer_template, severity_levels) VALUES
('frequent_mental_distress', 'health_outcomes', 'Many residents here experience frequent emotional distress', 'Lord, we pray for peace that surpasses understanding for those in {area_name} experiencing mental distress. Calm anxious hearts and troubled minds.', ARRAY['concerning', 'critical', 'very_critical']),
('frequent_mental_distress', 'health_outcomes', 'Stress and anxiety are common struggles in this community', 'Heavenly Father, lift the burdens weighing on the people of {area_name}. Grant rest to the weary and strength to the overwhelmed.', ARRAY['concerning', 'critical', 'very_critical']),
('frequent_mental_distress', 'health_outcomes', 'Emotional wellness is a significant challenge in this neighborhood', 'God, we ask for Your healing presence in {area_name}. Bring resources, support groups, and caring listeners to those who are struggling.', ARRAY['concerning', 'critical', 'very_critical']);

-- DIABETES PROMPTS
INSERT INTO prayer_prompt_types (metric_key, category, need_description, prayer_template, severity_levels) VALUES
('diabetes', 'health_outcomes', 'Diabetes affects a significant portion of this community', 'Lord, we pray for those in {area_name} managing diabetes. Grant them wisdom for healthy choices and access to medical care.', ARRAY['concerning', 'critical', 'very_critical']),
('diabetes', 'health_outcomes', 'Many families here struggle with diabetes-related health issues', 'Father, we lift up those in {area_name} whose lives are impacted by diabetes. Bring healing and prevention resources to this community.', ARRAY['concerning', 'critical', 'very_critical']),
('diabetes', 'health_outcomes', 'Diabetes rates are elevated in this neighborhood', 'God, we pray for healthy food access, education, and medical care for {area_name}. Help prevent new cases and manage existing ones.', ARRAY['concerning', 'critical', 'very_critical']),
('diabetes', 'health_outcomes', 'This area faces significant challenges with diabetes management', 'Heavenly Father, guide healthcare providers and community leaders in {area_name} as they address diabetes. Provide hope and healing.', ARRAY['critical', 'very_critical']);

-- UNINSURED / HEALTH INSURANCE PROMPTS
INSERT INTO prayer_prompt_types (metric_key, category, need_description, prayer_template, severity_levels) VALUES
('health_insurance', 'clinical_care', 'Many residents here lack health insurance', 'Lord, we pray for the uninsured in {area_name}. Open doors to coverage and healthcare access. No one should suffer for lack of care.', ARRAY['concerning', 'critical', 'very_critical']),
('uninsured', 'social_economic', 'Healthcare access is limited for many families in this community', 'Father, we lift up those in {area_name} who cannot afford medical care. Provide free clinics, sliding-scale services, and compassionate providers.', ARRAY['concerning', 'critical', 'very_critical']),
('health_insurance', 'clinical_care', 'The uninsured rate in this area leaves many vulnerable', 'God, we ask for solutions to the healthcare crisis in {area_name}. Bring resources, advocates, and coverage to those in need.', ARRAY['concerning', 'critical', 'very_critical']),
('uninsured', 'social_economic', 'People here sometimes avoid medical care because they can''t afford it', 'Heavenly Father, we pray against the impossible choices families in {area_name} face between health and finances. Provide a way.', ARRAY['critical', 'very_critical']);

-- UNEMPLOYMENT PROMPTS
INSERT INTO prayer_prompt_types (metric_key, category, need_description, prayer_template, severity_levels) VALUES
('unemployment', 'social_economic', 'Unemployment is a significant challenge in this community', 'Lord, we pray for job opportunities in {area_name}. Open doors of employment and provide for those seeking work.', ARRAY['concerning', 'critical', 'very_critical']),
('unemployment', 'social_economic', 'Many people here are searching for stable employment', 'Father, guide job seekers in {area_name} to the right opportunities. Grant them patience, skill, and favor in their search.', ARRAY['concerning', 'critical', 'very_critical']),
('unemployment', 'social_economic', 'This neighborhood faces higher than average unemployment rates', 'God, we ask for economic revitalization in {area_name}. Bring employers, entrepreneurs, and investment that creates good jobs.', ARRAY['concerning', 'critical', 'very_critical']),
('unemployment', 'social_economic', 'Lack of work opportunities affects families throughout this area', 'Heavenly Father, we pray for training programs, job fairs, and connections that help people in {area_name} find meaningful work.', ARRAY['critical', 'very_critical']);

-- TRANSPORTATION BARRIERS PROMPTS
INSERT INTO prayer_prompt_types (metric_key, category, need_description, prayer_template, severity_levels) VALUES
('transportation_barriers', 'social_needs', 'Getting around is a challenge for many residents here', 'Lord, we pray for transportation solutions in {area_name}. Help people get to work, medical appointments, and church.', ARRAY['concerning', 'critical', 'very_critical']),
('transportation_barriers', 'social_needs', 'Lack of reliable transportation limits opportunities in this area', 'Father, we lift up those in {area_name} stranded by transportation barriers. Provide vehicles, transit, and neighbors willing to help.', ARRAY['concerning', 'critical', 'very_critical']),
('transportation_barriers', 'social_needs', 'Many families here struggle to access essential services due to transportation', 'God, we ask for creative transportation solutions in {area_name}. May churches and community groups step up to fill the gap.', ARRAY['concerning', 'critical', 'very_critical']);

-- UTILITY SHUTOFF THREAT PROMPTS
INSERT INTO prayer_prompt_types (metric_key, category, need_description, prayer_template, severity_levels) VALUES
('utility_shutoff_threat', 'social_needs', 'Some families here risk losing electricity or heat', 'Lord, we pray for families in {area_name} facing utility shutoffs. Provide for their basic needs and connect them to assistance programs.', ARRAY['concerning', 'critical', 'very_critical']),
('utility_shutoff_threat', 'social_needs', 'Keeping the lights on is a monthly struggle for many in this community', 'Father, we lift up those in {area_name} choosing between utilities and other necessities. Provide unexpected help in their time of need.', ARRAY['concerning', 'critical', 'very_critical']),
('utility_shutoff_threat', 'social_needs', 'Utility insecurity affects vulnerable residents in this neighborhood', 'God, protect families in {area_name} from the dangers of utility shutoffs. Send resources and advocates to help them stay safe.', ARRAY['critical', 'very_critical']);

-- OBESITY PROMPTS
INSERT INTO prayer_prompt_types (metric_key, category, need_description, prayer_template, severity_levels) VALUES
('obesity', 'health_outcomes', 'Obesity rates are elevated in this community', 'Lord, we pray for the health of residents in {area_name}. Bring access to healthy food, safe places to exercise, and wellness resources.', ARRAY['concerning', 'critical', 'very_critical']),
('obesity', 'health_outcomes', 'Many people here face weight-related health challenges', 'Father, we lift up those in {area_name} struggling with their health. Remove barriers to wellness and bring encouragement for the journey.', ARRAY['concerning', 'critical', 'very_critical']),
('obesity', 'health_outcomes', 'This area faces challenges with healthy eating and active living', 'God, we ask for community health initiatives in {area_name}. Bring walking groups, farmers markets, and wellness programs that transform lives.', ARRAY['concerning', 'critical', 'very_critical']);

-- HIGH BLOOD PRESSURE PROMPTS
INSERT INTO prayer_prompt_types (metric_key, category, need_description, prayer_template, severity_levels) VALUES
('high_blood_pressure', 'health_outcomes', 'High blood pressure affects many residents in this area', 'Lord, we pray for the cardiovascular health of {area_name}. Grant wisdom for lifestyle changes and access to preventive care.', ARRAY['concerning', 'critical', 'very_critical']),
('high_blood_pressure', 'health_outcomes', 'Heart health is a concern for this community', 'Father, we lift up those in {area_name} managing high blood pressure. Reduce stress, improve diet, and bring healing to hearts.', ARRAY['concerning', 'critical', 'very_critical']),
('high_blood_pressure', 'health_outcomes', 'Cardiovascular risk factors are elevated in this neighborhood', 'God, we ask for health screenings, education, and resources in {area_name}. Prevent strokes and heart attacks through early intervention.', ARRAY['critical', 'very_critical']);

-- DISABILITY PROMPTS
INSERT INTO prayer_prompt_types (metric_key, category, need_description, prayer_template, severity_levels) VALUES
('any_disability', 'disabilities', 'Many residents here live with disabilities', 'Lord, we pray for those in {area_name} living with disabilities. Provide accessibility, support, and community that embraces all.', ARRAY['concerning', 'critical', 'very_critical']),
('any_disability', 'disabilities', 'This community includes many individuals with special needs', 'Father, we lift up caregivers and families in {area_name} supporting loved ones with disabilities. Grant them strength and resources.', ARRAY['concerning', 'critical', 'very_critical']),
('mobility_disability', 'disabilities', 'Mobility challenges affect many people in this area', 'God, we pray for accessible infrastructure in {area_name}. Remove barriers that prevent full participation in community life.', ARRAY['concerning', 'critical', 'very_critical']),
('cognitive_disability', 'disabilities', 'Cognitive disabilities impact families throughout this neighborhood', 'Heavenly Father, we pray for educational and support services for those in {area_name} with cognitive disabilities. Surround them with patience and love.', ARRAY['concerning', 'critical', 'very_critical']);

-- SMOKING / SUBSTANCE USE PROMPTS
INSERT INTO prayer_prompt_types (metric_key, category, need_description, prayer_template, severity_levels) VALUES
('current_smoking', 'health_behavior', 'Smoking rates are elevated in this community', 'Lord, we pray for freedom from addiction for smokers in {area_name}. Provide cessation resources and the support needed to quit.', ARRAY['concerning', 'critical', 'very_critical']),
('current_smoking', 'health_behavior', 'Many residents here struggle with tobacco addiction', 'Father, we lift up those in {area_name} trapped by nicotine addiction. Break chains of dependency and bring healing to bodies.', ARRAY['concerning', 'critical', 'very_critical']),
('binge_drinking', 'health_behavior', 'Alcohol misuse affects families in this area', 'God, we pray for those in {area_name} struggling with alcohol. Bring recovery resources, support groups, and lasting freedom.', ARRAY['concerning', 'critical', 'very_critical']);

-- SINGLE PARENT HOUSEHOLD PROMPTS  
INSERT INTO prayer_prompt_types (metric_key, category, need_description, prayer_template, severity_levels) VALUES
('children_in_single_parent_households', 'social_economic', 'Many children here are raised by single parents', 'Lord, we pray for single parents in {area_name} carrying heavy burdens alone. Surround them with support, rest, and community.', ARRAY['concerning', 'critical', 'very_critical']),
('children_in_single_parent_households', 'social_economic', 'Single-parent families face unique challenges in this community', 'Father, we lift up the single moms and dads of {area_name}. Multiply their time, energy, and resources. Raise up helpers and mentors.', ARRAY['concerning', 'critical', 'very_critical']),
('children_in_single_parent_households', 'social_economic', 'This neighborhood has many families led by one parent', 'God, we pray for the children in {area_name} growing up in single-parent homes. Provide role models, stability, and Your constant presence.', ARRAY['concerning', 'critical', 'very_critical']);

-- HOUSING COST BURDEN PROMPTS
INSERT INTO prayer_prompt_types (metric_key, category, need_description, prayer_template, severity_levels) VALUES
('housing_cost_burden', 'physical_environment', 'Housing costs consume too much of many families'' income here', 'Lord, we pray for affordable housing in {area_name}. Ease the financial burden on families spending too much on rent.', ARRAY['concerning', 'critical', 'very_critical']),
('housing_cost_burden', 'physical_environment', 'Many residents here are stretched thin by high housing costs', 'Father, we lift up those in {area_name} struggling to make rent. Provide relief, resources, and long-term housing solutions.', ARRAY['concerning', 'critical', 'very_critical']);

-- GENERAL HEALTH PROMPTS
INSERT INTO prayer_prompt_types (metric_key, category, need_description, prayer_template, severity_levels) VALUES
('general_health', 'health_outcomes', 'Overall health outcomes are concerning in this area', 'Lord, we pray for the holistic health of {area_name}. Bring healing, prevention, and wellness to every resident.', ARRAY['concerning', 'critical', 'very_critical']),
('general_health', 'health_outcomes', 'Many residents here report poor overall health', 'Father, we lift up those in {area_name} dealing with chronic health issues. Bring quality healthcare, healing, and hope.', ARRAY['concerning', 'critical', 'very_critical']);

-- Grant access to service role
GRANT ALL ON prayer_prompt_types TO service_role;
GRANT SELECT ON prayer_prompt_types TO authenticated;
GRANT SELECT ON prayer_prompt_types TO anon;

COMMENT ON TABLE prayer_prompt_types IS 'Pre-written prayer prompts linked to health metrics for Prayer Mode''s rolling feed';
