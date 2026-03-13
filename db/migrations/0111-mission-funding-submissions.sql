-- =====================================================================
-- MISSION FUNDING SUBMISSIONS TABLE
-- =====================================================================
-- Migration 0111: Client-facing mission funding buyer/seller submissions
-- 
-- This table stores buyer/seller submissions from the public
-- mission funding activation page.
-- =====================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop old enum if exists (for clean rebuild)
DROP TYPE IF EXISTS partner_role CASCADE;

-- Create buyer/seller type enum
DO $$ BEGIN
    CREATE TYPE buyer_seller_type AS ENUM (
        'buyer',
        'seller', 
        'both'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create timeline enum
DO $$ BEGIN
    CREATE TYPE funding_timeline AS ENUM (
        '0_3_months',
        '3_6_months', 
        '6_plus_months'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Drop old table if exists (for clean rebuild)
DROP TABLE IF EXISTS public.mission_funding_submissions CASCADE;

-- Create mission funding submissions table
CREATE TABLE IF NOT EXISTS public.mission_funding_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    church_id UUID REFERENCES public.churches(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Contact information
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    
    -- Buyer/Seller info
    buyer_seller_type buyer_seller_type NOT NULL,
    timeline funding_timeline,
    notes TEXT,
    
    -- Tracking
    is_logged_in BOOLEAN NOT NULL DEFAULT false,
    
    -- Processing status
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'converted', 'closed')),
    admin_notes TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_mission_funding_submissions_church ON public.mission_funding_submissions(church_id) WHERE church_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mission_funding_submissions_status ON public.mission_funding_submissions(status);
CREATE INDEX IF NOT EXISTS idx_mission_funding_submissions_type ON public.mission_funding_submissions(buyer_seller_type);
CREATE INDEX IF NOT EXISTS idx_mission_funding_submissions_new ON public.mission_funding_submissions(status, created_at) WHERE status = 'new';

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================

ALTER TABLE public.mission_funding_submissions ENABLE ROW LEVEL SECURITY;

-- Anyone can create submissions (public form)
DROP POLICY IF EXISTS "mission_funding_submissions_public_create" ON public.mission_funding_submissions;
CREATE POLICY "mission_funding_submissions_public_create" ON public.mission_funding_submissions
    FOR INSERT WITH CHECK (true);

-- Users can view their own submissions
DROP POLICY IF EXISTS "mission_funding_submissions_user_read_own" ON public.mission_funding_submissions;
CREATE POLICY "mission_funding_submissions_user_read_own" ON public.mission_funding_submissions
    FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Admins can view and manage all submissions
DROP POLICY IF EXISTS "mission_funding_submissions_admin_all" ON public.mission_funding_submissions;
CREATE POLICY "mission_funding_submissions_admin_all" ON public.mission_funding_submissions
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM city_platform_users cpu
            WHERE cpu.user_id = auth.uid()
                AND cpu.role IN ('super_admin', 'platform_owner', 'platform_admin')
                AND cpu.is_active = true
        )
    );

-- =====================================================================
-- UPDATED_AT TRIGGER
-- =====================================================================

DROP TRIGGER IF EXISTS update_mission_funding_submissions_updated_at ON public.mission_funding_submissions;
CREATE TRIGGER update_mission_funding_submissions_updated_at
    BEFORE UPDATE ON public.mission_funding_submissions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
