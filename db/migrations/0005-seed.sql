-- Insert ministry callings
INSERT INTO public.callings (name, type, description, color)
VALUES
  ('Youth & Students', 'people', 'Ministering to young people and students', '#ff9900'),
  ('Refugees & Immigrants', 'people', 'Supporting refugee and immigrant communities', '#ff6600'),
  ('Addiction & Recovery', 'problem', 'Helping those struggling with addiction', '#cc0000'),
  ('Marketplace & Business', 'purpose', 'Faith in business and professional settings', '#009999'),
  ('Homelessness', 'problem', 'Serving the homeless population', '#e74c3c'),
  ('Single Parents', 'people', 'Supporting single parent families', '#f39c12'),
  ('Seniors & Elderly', 'people', 'Ministry to senior citizens', '#9b59b6'),
  ('Arts & Culture', 'purpose', 'Expressing faith through arts and creativity', '#3498db'),
  ('Downtown Revitalization', 'place', 'Urban renewal and community development', '#2ecc71'),
  ('Suburban Families', 'place', 'Ministering in suburban contexts', '#16a085')
ON CONFLICT DO NOTHING;

-- Insert sample churches in Grand Rapids, MI area with real coordinates
INSERT INTO public.churches (name, address, city, state, zip, denomination, website, email, phone, location, description, approved, collaboration_have, collaboration_need)
VALUES
  (
    'Grace Community Church',
    '1234 Division Ave S',
    'Grand Rapids',
    'MI',
    '49507',
    'Non-Denominational',
    'https://gracegr.org',
    'info@gracegr.org',
    '(616) 555-0100',
    ST_SetSRID(ST_MakePoint(-85.6681, 42.9634), 4326)::geography,
    'A vibrant community focused on serving downtown Grand Rapids through practical ministries and neighborhood engagement.',
    true,
    ARRAY['Food pantry', 'Youth programs', 'Community center'],
    ARRAY['Volunteers for homeless outreach', 'Spanish translators', 'IT support']
  ),
  (
    'New Hope Fellowship',
    '789 Michigan St NE',
    'Grand Rapids',
    'MI',
    '49503',
    'Baptist',
    'https://newhopegr.com',
    'connect@newhopegr.com',
    '(616) 555-0200',
    ST_SetSRID(ST_MakePoint(-85.6553, 42.9693), 4326)::geography,
    'Dedicated to addiction recovery and helping those in crisis find hope and healing.',
    true,
    ARRAY['Recovery groups', 'Counseling services', 'Job training'],
    ARRAY['Licensed counselors', 'Financial support', 'Housing assistance']
  ),
  (
    'City Bridge Church',
    '456 Wealthy St SE',
    'Grand Rapids',
    'MI',
    '49506',
    'Presbyterian',
    'https://citybridgegr.org',
    'hello@citybridgegr.org',
    '(616) 555-0300',
    ST_SetSRID(ST_MakePoint(-85.6410, 42.9563), 4326)::geography,
    'Building bridges across cultures with a focus on refugee resettlement and immigrant integration.',
    true,
    ARRAY['ESL classes', 'Legal aid clinic', 'Cultural events'],
    ARRAY['Immigration attorneys', 'Childcare workers', 'Donations for families']
  ),
  (
    'Marketplace Ministries',
    '321 Monroe Center NW',
    'Grand Rapids',
    'MI',
    '49503',
    'Non-Denominational',
    'https://marketplacegr.com',
    'contact@marketplacegr.com',
    '(616) 555-0400',
    ST_SetSRID(ST_MakePoint(-85.6689, 42.9634), 4326)::geography,
    'Equipping Christian business leaders to integrate faith and work, with networking and mentorship opportunities.',
    true,
    ARRAY['Business networking', 'Leadership training', 'Mentorship program'],
    ARRAY['Meeting space', 'Speakers for events', 'Small business grants']
  ),
  (
    'Riverside Family Church',
    '890 Lake Michigan Dr NW',
    'Grand Rapids',
    'MI',
    '49504',
    'Methodist',
    'https://riversidefamilygr.org',
    'info@riversidefamilygr.org',
    '(616) 555-0500',
    ST_SetSRID(ST_MakePoint(-85.6972, 42.9808), 4326)::geography,
    'A family-oriented church focused on youth development and suburban community building.',
    true,
    ARRAY['Kids programs', 'Family events', 'Sports leagues'],
    ARRAY['Youth leaders', 'Audio/visual team', 'Transportation for events']
  )
ON CONFLICT DO NOTHING;

-- Link churches to their ministry callings
-- Note: Replace the calling IDs with actual UUIDs from your callings table
-- This creates the many-to-many relationships for filtering and badges

-- Grace Community Church: Youth, Downtown Revitalization, Single Parents
INSERT INTO public.church_calling (church_id, calling_id)
SELECT 
  c.id as church_id,
  cal.id as calling_id
FROM public.churches c
CROSS JOIN public.callings cal
WHERE c.name = 'Grace Community Church'
  AND cal.name IN ('Youth & Students', 'Downtown Revitalization', 'Single Parents')
ON CONFLICT DO NOTHING;

-- New Hope Fellowship: Addiction & Recovery, Homelessness, Seniors & Elderly  
INSERT INTO public.church_calling (church_id, calling_id)
SELECT 
  c.id as church_id,
  cal.id as calling_id
FROM public.churches c
CROSS JOIN public.callings cal
WHERE c.name = 'New Hope Fellowship'
  AND cal.name IN ('Addiction & Recovery', 'Homelessness', 'Seniors & Elderly')
ON CONFLICT DO NOTHING;

-- City Bridge Church: Refugees & Immigrants, Arts & Culture, Downtown Revitalization
INSERT INTO public.church_calling (church_id, calling_id)
SELECT 
  c.id as church_id,
  cal.id as calling_id
FROM public.churches c
CROSS JOIN public.callings cal
WHERE c.name = 'City Bridge Church'
  AND cal.name IN ('Refugees & Immigrants', 'Arts & Culture', 'Downtown Revitalization')
ON CONFLICT DO NOTHING;

-- Marketplace Ministries: Marketplace & Business, Youth & Students
INSERT INTO public.church_calling (church_id, calling_id)
SELECT 
  c.id as church_id,
  cal.id as calling_id
FROM public.churches c
CROSS JOIN public.callings cal
WHERE c.name = 'Marketplace Ministries'
  AND cal.name IN ('Marketplace & Business', 'Youth & Students')
ON CONFLICT DO NOTHING;

-- Riverside Family Church: Suburban Families, Youth & Students, Single Parents
INSERT INTO public.church_calling (church_id, calling_id)
SELECT 
  c.id as church_id,
  cal.id as calling_id
FROM public.churches c
CROSS JOIN public.callings cal
WHERE c.name = 'Riverside Family Church'
  AND cal.name IN ('Suburban Families', 'Youth & Students', 'Single Parents')
ON CONFLICT DO NOTHING;
