-- =====================================================================
-- PARTNERSHIP & SPONSORS SYSTEM
-- =====================================================================
-- Migration 0110: Fund the Mission infrastructure
-- 
-- This migration establishes:
-- 1. Partnership status enum and field on churches
-- 2. Sponsors table with levels (platform, regional, church-specific)
-- 3. Sponsor assignments for flexible targeting
-- 4. Partnership applications (Explore/Authorize paths)
-- 5. AARE submissions for conversion tracking
-- =====================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================================
-- 1. PARTNERSHIP STATUS ENUM AND CHURCH FIELD
-- =====================================================================

-- Create partnership status enum
DO $$ BEGIN
    CREATE TYPE partnership_status AS ENUM (
        'unclaimed',    -- Church not yet claimed
        'claimed',      -- Church claimed but no partnership interest
        'interest',     -- Partnership Interest submitted (Explore path)
        'pending',      -- Partnership Pending (Authorize path submitted)
        'active'        -- Partnership Active (JV documents executed)
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add partnership fields to churches table
ALTER TABLE public.churches 
    ADD COLUMN IF NOT EXISTS partnership_status partnership_status NOT NULL DEFAULT 'unclaimed',
    ADD COLUMN IF NOT EXISTS partnership_updated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS partnership_notes TEXT;

-- Create index for partnership status queries
CREATE INDEX IF NOT EXISTS idx_churches_partnership_status ON public.churches(partnership_status);

-- =====================================================================
-- 2. SPONSORS TABLE
-- =====================================================================

-- Create sponsor level enum
DO $$ BEGIN
    CREATE TYPE sponsor_level AS ENUM (
        'platform',     -- Platform-wide sponsor (visible everywhere)
        'regional',     -- Regional sponsor (visible in specific regions)
        'church'        -- Church-specific sponsor
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.sponsors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    logo_url TEXT,
    website_url TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    description TEXT,
    level sponsor_level NOT NULL DEFAULT 'platform',
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sponsors_level ON public.sponsors(level);
CREATE INDEX IF NOT EXISTS idx_sponsors_active ON public.sponsors(is_active) WHERE is_active = true;

-- =====================================================================
-- 3. SPONSOR ASSIGNMENTS TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.sponsor_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sponsor_id UUID NOT NULL REFERENCES public.sponsors(id) ON DELETE CASCADE,
    
    -- Assignment target (exactly one should be set based on sponsor level)
    church_id UUID REFERENCES public.churches(id) ON DELETE CASCADE,
    city_platform_id UUID REFERENCES public.city_platforms(id) ON DELETE CASCADE,
    
    -- Display window
    display_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    display_to TIMESTAMPTZ,
    
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Prevent duplicate assignments
    UNIQUE(sponsor_id, church_id),
    UNIQUE(sponsor_id, city_platform_id)
);

CREATE INDEX IF NOT EXISTS idx_sponsor_assignments_church ON public.sponsor_assignments(church_id) WHERE church_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sponsor_assignments_platform ON public.sponsor_assignments(city_platform_id) WHERE city_platform_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sponsor_assignments_active ON public.sponsor_assignments(is_active, display_from, display_to) WHERE is_active = true;

-- =====================================================================
-- 4. PARTNERSHIP APPLICATIONS TABLE
-- =====================================================================

-- Create application path enum
DO $$ BEGIN
    CREATE TYPE partnership_application_path AS ENUM (
        'explore',      -- No authority required, informational
        'authorize'     -- Authority required, initiates JV process
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create application status enum
DO $$ BEGIN
    CREATE TYPE partnership_application_status AS ENUM (
        'new',          -- Just submitted
        'reviewed',     -- Admin has reviewed
        'closed'        -- Completed/archived
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.partnership_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    church_id UUID NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Application details
    path partnership_application_path NOT NULL,
    applicant_name TEXT NOT NULL,
    applicant_role TEXT NOT NULL,
    applicant_email TEXT NOT NULL,
    applicant_phone TEXT,
    
    -- Affirmation and notes
    has_authority_affirmation BOOLEAN NOT NULL DEFAULT false,
    notes TEXT,
    
    -- Processing
    status partnership_application_status NOT NULL DEFAULT 'new',
    reviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewer_notes TEXT,
    reviewed_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partnership_applications_church ON public.partnership_applications(church_id);
CREATE INDEX IF NOT EXISTS idx_partnership_applications_status ON public.partnership_applications(status);
CREATE INDEX IF NOT EXISTS idx_partnership_applications_path ON public.partnership_applications(path);
CREATE INDEX IF NOT EXISTS idx_partnership_applications_new ON public.partnership_applications(status, created_at) WHERE status = 'new';

-- =====================================================================
-- 5. AARE SUBMISSIONS TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.aare_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    church_id UUID REFERENCES public.churches(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Contact info (for logged-out users)
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    
    -- Submission context
    submission_type TEXT NOT NULL DEFAULT 'fund_mission_page',
    notes TEXT,
    
    -- Processing
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'closed')),
    admin_notes TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aare_submissions_church ON public.aare_submissions(church_id) WHERE church_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_aare_submissions_status ON public.aare_submissions(status);
CREATE INDEX IF NOT EXISTS idx_aare_submissions_new ON public.aare_submissions(status, created_at) WHERE status = 'new';

-- =====================================================================
-- 6. ROW LEVEL SECURITY
-- =====================================================================

-- Sponsors: public read, admin write
ALTER TABLE public.sponsors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sponsors_public_read" ON public.sponsors;
CREATE POLICY "sponsors_public_read" ON public.sponsors
    FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "sponsors_admin_all" ON public.sponsors;
CREATE POLICY "sponsors_admin_all" ON public.sponsors
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM city_platform_users cpu
            WHERE cpu.user_id = auth.uid()
                AND cpu.role = 'super_admin'
                AND cpu.is_active = true
        )
    );

-- Sponsor assignments: public read active, admin write
ALTER TABLE public.sponsor_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sponsor_assignments_public_read" ON public.sponsor_assignments;
CREATE POLICY "sponsor_assignments_public_read" ON public.sponsor_assignments
    FOR SELECT USING (
        is_active = true 
        AND display_from <= NOW() 
        AND (display_to IS NULL OR display_to >= NOW())
    );

DROP POLICY IF EXISTS "sponsor_assignments_admin_all" ON public.sponsor_assignments;
CREATE POLICY "sponsor_assignments_admin_all" ON public.sponsor_assignments
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM city_platform_users cpu
            WHERE cpu.user_id = auth.uid()
                AND cpu.role = 'super_admin'
                AND cpu.is_active = true
        )
    );

-- Partnership applications: users can create and view own, admins can view/update all
ALTER TABLE public.partnership_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "partnership_applications_user_create" ON public.partnership_applications;
CREATE POLICY "partnership_applications_user_create" ON public.partnership_applications
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "partnership_applications_user_read_own" ON public.partnership_applications;
CREATE POLICY "partnership_applications_user_read_own" ON public.partnership_applications
    FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "partnership_applications_admin_all" ON public.partnership_applications;
CREATE POLICY "partnership_applications_admin_all" ON public.partnership_applications
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM city_platform_users cpu
            WHERE cpu.user_id = auth.uid()
                AND cpu.role IN ('super_admin', 'platform_owner', 'platform_admin')
                AND cpu.is_active = true
        )
    );

-- AARE submissions: users can create, admins can view/update
ALTER TABLE public.aare_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aare_submissions_public_create" ON public.aare_submissions;
CREATE POLICY "aare_submissions_public_create" ON public.aare_submissions
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "aare_submissions_user_read_own" ON public.aare_submissions;
CREATE POLICY "aare_submissions_user_read_own" ON public.aare_submissions
    FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "aare_submissions_admin_all" ON public.aare_submissions;
CREATE POLICY "aare_submissions_admin_all" ON public.aare_submissions
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM city_platform_users cpu
            WHERE cpu.user_id = auth.uid()
                AND cpu.role = 'super_admin'
                AND cpu.is_active = true
        )
    );

-- =====================================================================
-- 7. UPDATED_AT TRIGGERS
-- =====================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_sponsors_updated_at ON public.sponsors;
CREATE TRIGGER update_sponsors_updated_at
    BEFORE UPDATE ON public.sponsors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sponsor_assignments_updated_at ON public.sponsor_assignments;
CREATE TRIGGER update_sponsor_assignments_updated_at
    BEFORE UPDATE ON public.sponsor_assignments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_partnership_applications_updated_at ON public.partnership_applications;
CREATE TRIGGER update_partnership_applications_updated_at
    BEFORE UPDATE ON public.partnership_applications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_aare_submissions_updated_at ON public.aare_submissions;
CREATE TRIGGER update_aare_submissions_updated_at
    BEFORE UPDATE ON public.aare_submissions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
