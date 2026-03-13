-- =====================================================================
-- ADD 'RELEASED' STATUS TO CHURCH CLAIMS
-- =====================================================================
-- Migration 0114: Add 'released' status option to church_claims table
-- 
-- This allows claims to be marked as released when a church admin
-- voluntarily releases their management of a church, allowing someone
-- else to claim it.
-- =====================================================================

-- Drop the existing CHECK constraint and recreate with 'released' included
ALTER TABLE church_claims 
DROP CONSTRAINT IF EXISTS church_claims_status_check;

ALTER TABLE church_claims 
ADD CONSTRAINT church_claims_status_check 
CHECK (status IN ('pending', 'approved', 'rejected', 'released'));
