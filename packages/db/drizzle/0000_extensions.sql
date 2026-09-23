-- Extensions the spec relies on (section 2): pgvector for semantic search, pg_trgm for fuzzy title match.
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
