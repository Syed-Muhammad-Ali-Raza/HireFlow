-- HireFlow Database Migration — Phase 3 (Background Queue Support)
-- Run this in the Supabase SQL Editor BEFORE testing the queue features
-- Guide: docs/SUPABASE_SETUP.md

-- 1. Add processing columns to Candidates table
ALTER TABLE public.candidates
ADD COLUMN IF NOT EXISTS processing_status text DEFAULT 'completed' CHECK (processing_status IN ('queued', 'processing', 'completed', 'failed')) NOT NULL,
ADD COLUMN IF NOT EXISTS processing_error text;

-- 2. Create index for performance on processing_status
CREATE INDEX IF NOT EXISTS idx_candidates_processing_status ON public.candidates(processing_status);
