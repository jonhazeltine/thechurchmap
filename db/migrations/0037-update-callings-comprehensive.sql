-- Migration 0037: Replace callings with comprehensive framework
-- Removes all place-based callings (handled by map boundaries)
-- Adds People, Problem, and Purpose callings
-- Clears all placeholder calling assignments from churches

-- First, clear all church-calling associations
DELETE FROM church_calling;

-- Delete all existing callings
DELETE FROM callings;

-- B. Called to a People
INSERT INTO callings (id, name, type, description, color) VALUES
(gen_random_uuid(), 'Families', 'people', 'Ministry to families and family units', '#10b981'),
(gen_random_uuid(), 'Single parents', 'people', 'Support and community for single-parent households', '#10b981'),
(gen_random_uuid(), 'Youth / students', 'people', 'Ministry to youth and students', '#10b981'),
(gen_random_uuid(), 'Young adults', 'people', 'Ministry to young adults', '#10b981'),
(gen_random_uuid(), 'Immigrants / refugees', 'people', 'Support and welcome for immigrants and refugees', '#10b981'),
(gen_random_uuid(), 'Specific cultural / ethnic communities', 'people', 'Ministry to specific cultural or ethnic groups', '#10b981'),
(gen_random_uuid(), 'Justice-impacted individuals', 'people', 'Ministry to incarcerated and returning citizens', '#10b981'),
(gen_random_uuid(), 'Seniors', 'people', 'Ministry to senior adults', '#10b981'),
(gen_random_uuid(), 'Marketplace leaders', 'people', 'Ministry to business and marketplace leaders', '#10b981'),
(gen_random_uuid(), 'Artists / creatives', 'people', 'Ministry to artists and creative professionals', '#10b981'),
(gen_random_uuid(), 'Educators', 'people', 'Ministry to teachers and education professionals', '#10b981'),
(gen_random_uuid(), 'Healthcare workers', 'people', 'Ministry to healthcare professionals', '#10b981'),
(gen_random_uuid(), 'Trades / labor force', 'people', 'Ministry to trades and labor workers', '#10b981'),
(gen_random_uuid(), 'Veterans', 'people', 'Ministry to veterans and military families', '#10b981'),
(gen_random_uuid(), 'The marginalized / overlooked', 'people', 'Ministry to those on the margins of society', '#10b981');

-- C. Called to a Problem
INSERT INTO callings (id, name, type, description, color) VALUES
(gen_random_uuid(), 'Poverty relief', 'problem', 'Addressing poverty and economic hardship', '#f59e0b'),
(gen_random_uuid(), 'Affordable housing', 'problem', 'Creating and supporting affordable housing solutions', '#f59e0b'),
(gen_random_uuid(), 'Food insecurity', 'problem', 'Fighting hunger and food access challenges', '#f59e0b'),
(gen_random_uuid(), 'Foster care & adoption', 'problem', 'Supporting foster and adoptive families', '#f59e0b'),
(gen_random_uuid(), 'Mental health', 'problem', 'Addressing mental health needs and stigma', '#f59e0b'),
(gen_random_uuid(), 'Loneliness', 'problem', 'Combating isolation and building community', '#f59e0b'),
(gen_random_uuid(), 'Addiction', 'problem', 'Recovery and support for addiction', '#f59e0b'),
(gen_random_uuid(), 'Violence reduction', 'problem', 'Working toward peace and reducing violence', '#f59e0b'),
(gen_random_uuid(), 'Racial healing', 'problem', 'Pursuing racial reconciliation and justice', '#f59e0b'),
(gen_random_uuid(), 'Family restoration', 'problem', 'Healing and restoring broken families', '#f59e0b'),
(gen_random_uuid(), 'Youth development', 'problem', 'Investing in youth growth and opportunities', '#f59e0b'),
(gen_random_uuid(), 'Education gaps', 'problem', 'Closing educational disparities', '#f59e0b'),
(gen_random_uuid(), 'Homelessness', 'problem', 'Serving those experiencing homelessness', '#f59e0b'),
(gen_random_uuid(), 'Elder care', 'problem', 'Supporting aging adults and caregivers', '#f59e0b'),
(gen_random_uuid(), 'Human trafficking', 'problem', 'Fighting human trafficking and supporting survivors', '#f59e0b'),
(gen_random_uuid(), 'Immigration support', 'problem', 'Supporting immigrants and immigration reform', '#f59e0b'),
(gen_random_uuid(), 'Financial stewardship', 'problem', 'Teaching financial wisdom and stewardship', '#f59e0b'),
(gen_random_uuid(), 'Entrepreneurship / job creation', 'problem', 'Creating economic opportunities and jobs', '#f59e0b'),
(gen_random_uuid(), 'Creation care', 'problem', 'Environmental stewardship and creation care', '#f59e0b'),
(gen_random_uuid(), 'Crisis response / disaster relief', 'problem', 'Responding to crises and disasters', '#f59e0b');

-- D. Called to a Purpose
INSERT INTO callings (id, name, type, description, color) VALUES
(gen_random_uuid(), 'Spiritual renewal', 'purpose', 'Catalyzing spiritual awakening and renewal', '#a855f7'),
(gen_random_uuid(), 'Reconciliation & peacemaking', 'purpose', 'Building bridges and pursuing peace', '#a855f7'),
(gen_random_uuid(), 'Formation & discipleship depth', 'purpose', 'Deep spiritual formation and discipleship', '#a855f7'),
(gen_random_uuid(), 'Church-planting & multiplication', 'purpose', 'Starting and multiplying new churches', '#a855f7'),
(gen_random_uuid(), 'Hospitality to the stranger', 'purpose', 'Radical welcome and hospitality', '#a855f7'),
(gen_random_uuid(), 'Economic renewal & community flourishing', 'purpose', 'Whole-community economic and social renewal', '#a855f7'),
(gen_random_uuid(), 'Healing & restoration', 'purpose', 'Personal and communal healing ministry', '#a855f7'),
(gen_random_uuid(), 'Cultural creation & imagination shaping', 'purpose', 'Creating culture and shaping imagination', '#a855f7'),
(gen_random_uuid(), 'Marketplace discipleship & public witness', 'purpose', 'Faith in public and marketplace life', '#a855f7'),
(gen_random_uuid(), 'Regional unity building', 'purpose', 'Building unity across the church in a region', '#a855f7'),
(gen_random_uuid(), 'Innovation / new expressions', 'purpose', 'Pioneering new forms of church and mission', '#a855f7');

COMMENT ON TABLE callings IS 'Ministry callings organized by People, Problem, and Purpose (Place callings handled via map boundaries)';
