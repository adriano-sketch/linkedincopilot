-- The profile enrichment job is switched off. Nothing puts people in the statuses it processed
-- (new, imported, enriching) since Add people uses the contact picker (#75), and no list row in
-- production was ever enriched from an outside provider. The two functions that called those providers
-- (enrich-leads-batch, capture-profile-scrapin) are replaced by stubs in the same change, so the watchdog,
-- which still calls the first one, cannot reach a provider either.
do $$
declare jid bigint;
begin
  select jobid into jid from cron.job where jobname = 'enrichment-icp-cron';
  if jid is not null then
    perform cron.alter_job(job_id := jid, active := false);
  end if;
end $$;
