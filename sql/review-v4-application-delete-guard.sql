-- REVIEW ONLY. Synthetic fixtures only; production requires approval and native validation.
-- Matches the driver UI's pending/candidate cancellation boundary.
BEGIN;
DO $guard$ BEGIN
 IF current_setting('spodora.local_restore_review',true) IS DISTINCT FROM 'yes'
 THEN RAISE EXCEPTION 'Local review opt-in required'; END IF;
END $guard$;
CREATE POLICY "V4 retain confirmed and attended applications"
ON public.applications AS RESTRICTIVE FOR DELETE TO authenticated
USING (status IN ('応募中','採用候補') AND checked_in_at IS NULL AND checked_out_at IS NULL);
-- Existing permissive ownership policy must also pass. No rows are deleted or rewritten.
ROLLBACK;
