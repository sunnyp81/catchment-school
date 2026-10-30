CREATE TABLE IF NOT EXISTS performance (urn TEXT NOT NULL, year TEXT NOT NULL, a8 REAL, p8 REAL, p8_lower REAL, p8_upper REAL, em5 REAL, em4 REAL, ks4_cohort INTEGER, alevel_aps REAL, alevel_grade TEXT, alevel_entries INTEGER, abs_overall REAL, abs_persistent REAL, PRIMARY KEY (urn, year));
CREATE INDEX IF NOT EXISTS idx_perf_urn ON performance(urn);
