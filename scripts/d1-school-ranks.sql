DROP TABLE IF EXISTS school_ranks;
CREATE TABLE school_ranks (urn TEXT NOT NULL, metric TEXT NOT NULL, value REAL NOT NULL, rank INTEGER NOT NULL, of_n INTEGER NOT NULL, la_rank INTEGER, la_of_n INTEGER, year TEXT NOT NULL, pool TEXT NOT NULL, PRIMARY KEY (urn, metric));
