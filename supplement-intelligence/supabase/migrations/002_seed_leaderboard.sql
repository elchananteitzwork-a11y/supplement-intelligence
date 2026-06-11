-- Seed the leaderboard with pre-researched categories
-- These come from the Historical Winners Test and 25-category analysis

insert into public.leaderboard (category_name, opportunity_score, build_decision, biggest_competitor, market_size, sub_ltv, analysis_count)
values
  ('Bloating + Fatigue',         80, 'BUILD_NOW',        'Arrae',              '$14.4B (2025)', '$294',  1),
  ('Bloating Relief',            78, 'BUILD_NOW',        'Arrae',              '$14.4B (2025)', '$270',  1),
  ('Hormonal Acne + Gut',        77, 'BUILD_NOW',        'CLEARSTEM',          '$5.5B (2025)',  '$375',  1),
  ('Perimenopause Support',      75, 'BUILD_NOW',        'Bonafide',           '$8B+',          '$420',  1),
  ('Menopause Weight Gain',      75, 'BUILD_NOW',        'Estroven',           '$5.5B (2025)',  '$380',  1),
  ('PCOS Weight Loss',           73, 'BUILD_NOW',        'Ovasitol',           '$3.2B',         '$310',  1),
  ('Anxiety + Gut',              73, 'BUILD_NOW',        'Atrantil',           '$6B+',          '$300',  1),
  ('Cortisol Support',           72, 'BUILD_NOW',        'Moon Juice',         '$4B+',          '$280',  1),
  ('Hair Loss + Stress',         72, 'BUILD_NOW',        'Nutrafol',           '$1.87B (2025)', '$470',  1),
  ('Stress Shedding',            72, 'BUILD_NOW',        'Nutrafol',           '$1.87B (2025)', '$440',  1),
  ('Postpartum Recovery',        70, 'VALIDATE_FURTHER', 'Needed',             '$1.2B',         '$350',  1),
  ('GLP-1 Support',              70, 'VALIDATE_FURTHER', 'Pendulum',           '$2B+',          '$240',  1),
  ('Insulin Resistance',         70, 'VALIDATE_FURTHER', 'Thorne',             '$4B+',          '$260',  1),
  ('Hair Growth Women',          68, 'VALIDATE_FURTHER', 'Nutrafol',           '$1.87B (2025)', '$400',  1),
  ('IBS Relief',                 68, 'VALIDATE_FURTHER', 'IBgard',             '$3.5B',         '$280',  1),
  ('Blood Sugar Support',        67, 'VALIDATE_FURTHER', 'Glucofit',           '$4B+',          '$250',  1),
  ('Women''s Libido',            65, 'VALIDATE_FURTHER', 'Femmenessence',      '$1.5B',         '$230',  1),
  ('Brain Fog',                  63, 'VALIDATE_FURTHER', 'Thesis',             '$2B+',          '$240',  1),
  ('Hormone Balance',            63, 'VALIDATE_FURTHER', 'HUM Nutrition',      '$8B+',          '$240',  1),
  ('Digestive Enzymes',          63, 'VALIDATE_FURTHER', 'Enzymedica',         '$3B+',          '$210',  1),
  ('Sleep Optimization',         63, 'VALIDATE_FURTHER', 'Olly (Unilever)',    '$5.5B',         '$220',  1),
  ('Focus Gummies',              62, 'VALIDATE_FURTHER', 'Lemme',              '$2B+',          '$200',  1),
  ('Chronic Fatigue',            58, 'SKIP',             '—',                  '$2B+',          null,    1),
  ('Female Energy',              58, 'SKIP',             'AG1',                '$6B+',          null,    1),
  ('ADHD Focus',                 58, 'SKIP',             'Thesis',             '$1.5B',         null,    1),
  ('Leaky Gut',                  58, 'SKIP',             'Dr. Axe',            '$800M',         null,    1),
  ('Mood Support',               55, 'SKIP',             '—',                  '$4B+',          null,    1),
  ('Joint Pain',                 52, 'SKIP',             'Move Free (Reckitt)', '$4.5B',        null,    1)
on conflict (category_name) do nothing;
