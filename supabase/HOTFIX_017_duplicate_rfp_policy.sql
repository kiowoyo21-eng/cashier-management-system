-- Run only if migration 017 previously failed with policy already exists.
DROP POLICY IF EXISTS rfp_legacy_handover_management_read ON public.fund_turnovers;
