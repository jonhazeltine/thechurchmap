# Prayer Table Migration Instructions

## ⚠️ IMPORTANT: Run this SQL in Supabase SQL Editor

The `prayers` table exists in your Supabase cloud database and needs to be updated to support global and regional prayers.

### Steps:

1. **Go to your Supabase Dashboard** → SQL Editor
2. **Copy and paste the SQL below**
3. **Click "Run"**

### SQL to Execute:

```sql
-- Step 1: Make church_id nullable to support global/regional prayers
ALTER TABLE public.prayers 
  ALTER COLUMN church_id DROP NOT NULL;

-- Step 2: Add check constraint for data integrity
ALTER TABLE public.prayers
  DROP CONSTRAINT IF EXISTS prayers_scope_check;
  
ALTER TABLE public.prayers
  ADD CONSTRAINT prayers_scope_check 
  CHECK (
    -- Church prayers: must have church_id, not global, no region_type
    (church_id IS NOT NULL AND global = false AND region_type IS NULL)
    OR
    -- Global/Regional prayers: no church_id, but must have global=true OR region_type set
    (church_id IS NULL AND (global = true OR region_type IS NOT NULL))
  );

-- Step 3: Update indexes to handle nullable church_id efficiently
DROP INDEX IF EXISTS idx_prayers_church_id;
DROP INDEX IF EXISTS idx_prayers_church_status;
DROP INDEX IF EXISTS idx_prayers_church_created;

CREATE INDEX idx_prayers_church_id ON public.prayers(church_id) WHERE church_id IS NOT NULL;
CREATE INDEX idx_prayers_church_status ON public.prayers(church_id, status) WHERE church_id IS NOT NULL;
CREATE INDEX idx_prayers_church_created ON public.prayers(church_id, created_at DESC) WHERE church_id IS NOT NULL;

-- Step 4: Add indexes for global/regional prayers
CREATE INDEX IF NOT EXISTS idx_prayers_global ON public.prayers(global, status) WHERE global = true;
CREATE INDEX IF NOT EXISTS idx_prayers_regional ON public.prayers(region_type, region_id, status) WHERE region_type IS NOT NULL;
```

### What this does:

- ✅ Makes `church_id` nullable (allows global/regional prayers without a church)
- ✅ Adds constraint to ensure prayers are either church-specific OR global/regional (not both)
- ✅ Optimizes indexes for both church and global/regional prayer queries
- ✅ Maintains data integrity

### After running the migration:

The prayer creation form will work correctly for both:
- **Global prayers** (visible everywhere)
- **Regional prayers** (visible in specific cities/counties/zips)
- **Church prayers** (visible for specific churches - existing functionality)
