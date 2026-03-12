CREATE TABLE IF NOT EXISTS schools (
  slug TEXT PRIMARY KEY,
  urn TEXT,
  name TEXT,
  town TEXT,
  townSlug TEXT,
  la TEXT,
  laSlug TEXT,
  phase TEXT,
  type TEXT,
  ageRange TEXT,
  pupils INTEGER,
  capacity INTEGER,
  postcode TEXT,
  street TEXT,
  locality TEXT,
  lat REAL,
  lng REAL,
  website TEXT,
  gender TEXT,
  religion TEXT,
  admissionsPolicy TEXT,
  fsm REAL
);

CREATE INDEX IF NOT EXISTS idx_town_phase ON schools(town, phase);
CREATE INDEX IF NOT EXISTS idx_slug ON schools(slug);
