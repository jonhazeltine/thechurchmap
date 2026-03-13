# Migration 0034 - Primary Ministry Areas

**Status**: SQL written, needs to be run in Supabase

**Location**: `db/migrations/0034-primary-ministry-areas.sql`

**What it does**:
1. Adds `primary_ministry_area` column to `churches` table (nullable geography polygon)
2. Adds `calling_id` column to `areas` table to link ministry areas to specific callings3. Creates indexes for spatial queries

**To run this migration**:
Run the SQL in `db/migrations/0034-primary-ministry-areas.sql` directly in your Supabase SQL editor.

