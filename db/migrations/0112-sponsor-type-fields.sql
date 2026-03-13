-- Migration: Add sponsor type and license fields
-- Adds sponsor_type (realtor/lender/other), nmls_number, and agent_license_number columns

-- Add sponsor_type column with default 'other'
ALTER TABLE public.sponsors
  ADD COLUMN IF NOT EXISTS sponsor_type text NOT NULL DEFAULT 'other'
  CHECK (sponsor_type IN ('realtor', 'lender', 'other'));

-- Add license number fields
ALTER TABLE public.sponsors
  ADD COLUMN IF NOT EXISTS nmls_number text;

ALTER TABLE public.sponsors
  ADD COLUMN IF NOT EXISTS agent_license_number text;

-- Add comment for documentation
COMMENT ON COLUMN public.sponsors.sponsor_type IS 'Type of sponsor: realtor, lender, or other';
COMMENT ON COLUMN public.sponsors.nmls_number IS 'NMLS number for lenders';
COMMENT ON COLUMN public.sponsors.agent_license_number IS 'Agent license number for realtors';
