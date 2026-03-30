import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALERT_EMAIL = "support@scantosell.io";
const ENRICHABLE_SOURCES = ["csv", "search", "apollo"];
const ENRICHABLE_STATUSES = ["new", "imported", "ready", "icp_rejected", "icp_matched"];

interface Issue {
  severity: "critical" | "warning" | "info";
  area: string;
  description: string;
  auto_fixed: boolean;
  details?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const supabase = createClient(supabaseUrl, supabaseKey);

  const now = new Date();
  const issues: Issue[] = [];
  const stats: Record<string, any> = {};

  // ═══════════════════════════════════════════════════════
  // 0. DAILY COUNTER RESET
  // ═══════════════════════════════════════════════════════
  const { data: allExt } = await supabase
    .from("extension_status")
    .select("user_id, last_limit_reset_at, is_connected, last_heartbeat_at, is_paused, linkedin_logged_in, actions_today, connection_requests_today, messages_today, visits_today");

  const todayDateStr = now.toISOString().slice(0, 10); // "YYYY-MM-DD"
  let countersReset = 0;

  for (const ext of allExt || []) {
    const lastReset = ext.last_limit_reset_at ? new Date(ext.last_limit_reset_at) : null;
    const lastResetDate = lastReset ? lastReset.toISOString().slice(0, 10) : null;

    if (lastResetDate !== todayDateStr) {
      await supabase
        .from("extension_status")
        .update({
          visits_today: 0,
          actions_today: 0,
          connection_requests_today: 0,
          messages_today: 0,
          last_limit_reset_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("user_id", ext.user_id);
      countersReset++;
    }
  }

  if (countersReset > 0) {
    issues.push({
      severity: "info",
      area: "Daily Reset",
      description: `Contadores diários resetados para ${countersReset} usuário(s)`,
      auto_fixed: true,
    });
  }

  stats.counters_reset = countersReset;

  // ═══════════════════════════════════════════════════════
  // 1. EXTENSION HEARTBEAT CHECK
  // ═══════════════════════════════════════════════════════
  const extensions = allExt;

  for (const ext of extensions || []) {
    if (!ext.is_connected) continue;

    const lastBeat = ext.last_heartbeat_at ? new Date(ext.last_heartbeat_at) : null;
    const minutesSinceHeartbeat = lastBeat ? (now.getTime() - lastBeat.getTime()) / 60000 : Infinity;

    if (minutesSinceHeartbeat > 30) {
      // Auto-fix: mark as disconnected
      await supabase
        .from("extension_status")
        .update({ is_connected: false, updated_at: now.toISOString() })
        .eq("user_id", ext.user_id);

      issues.push({
        severity: "critical",
        area: "Extension Heartbeat",
        description: `User ${ext.user_id.slice(0, 8)}… sem heartbeat há ${Math.round(minutesSinceHeartbeat)}min`,
        auto_fixed: true,
        details: `Marcado como desconectado. Último heartbeat: ${lastBeat?.toISOString() || 'nunca'}`,
      });
    } else if (minutesSinceHeartbeat > 10) {
      issues.push({
        severity: "warning",
        area: "Extension Heartbeat",
        description: `User ${ext.user_id.slice(0, 8)}… heartbeat atrasado (${Math.round(minutesSinceHeartbeat)}min)`,
        auto_fixed: false,
      });
    }
  }

  stats.extensions = {
    total: extensions?.length || 0,
    connected: extensions?.filter(e => e.is_connected).length || 0,
    paused: extensions?.filter(e => e.is_paused).length || 0,
  };

  // ═══════════════════════════════════════════════════════
  // 2. STUCK LEADS — leads in intermediate status too long
  // ═══════════════════════════════════════════════════════
  const stuckStatuses = [
    // Only truly transient processing states should be auto-reset.
    // Pipeline states like visiting_profile/following/liking_post are valid for long periods
    // depending on daily limits and must NOT be reset here.
    { status: "enriching", maxHours: 2 },
    { status: "generating_messages", maxHours: 1 },
    { status: "checking_icp", maxHours: 1 },
  ];

  let totalStuckFixed = 0;

  for (const { status, maxHours } of stuckStatuses) {
    const cutoff = new Date(now.getTime() - maxHours * 3600000).toISOString();
    const { data: stuckLeads } = await supabase
      .from("campaign_leads")
      .select("id, user_id, linkedin_url, status, updated_at")
      .eq("status", status)
      .lt("updated_at", cutoff)
      .limit(100);

    if (stuckLeads && stuckLeads.length > 0) {
      // Auto-fix: reset to 'ready' so they can be re-processed
      const ids = stuckLeads.map(l => l.id);
      await supabase
        .from("campaign_leads")
        .update({
          status: "ready",
          next_action_at: new Date(now.getTime() + 5 * 60000).toISOString(),
          retry_count: 0,
          updated_at: now.toISOString(),
        } as any)
        .in("id", ids);

      totalStuckFixed += stuckLeads.length;

      issues.push({
        severity: "warning",
        area: "Leads Travados",
        description: `${stuckLeads.length} leads presos em "${status}" por mais de ${maxHours}h`,
        auto_fixed: true,
        details: `Resetados para 'ready'. IDs: ${ids.slice(0, 5).map(id => id.slice(0, 8)).join(', ')}${ids.length > 5 ? '…' : ''}`,
      });
    }
  }

  stats.stuck_leads_fixed = totalStuckFixed;

  // ═══════════════════════════════════════════════════════
  // 2b. MISMATCHED STATUS — reconciliation without flow regression
  // ═══════════════════════════════════════════════════════
  const { data: activeCampaignRows } = await supabase
    .from("campaign_profiles")
    .select("id")
    .eq("status", "active");

  const activeCampaignIds = (activeCampaignRows || []).map(c => c.id);

  const { data: mismatchedLeads } = activeCampaignIds.length > 0
    ? await supabase
      .from("campaign_leads")
      .select("id, followed_at")
      .eq("status", "ready")
      .not("profile_visited_at", "is", null)
      .in("campaign_profile_id", activeCampaignIds)
      .limit(400)
    : { data: [] as any[] };

  let mismatchedFixed = 0;
  if (mismatchedLeads && mismatchedLeads.length > 0) {
    const toFollowing = mismatchedLeads.filter(l => l.followed_at).map(l => l.id);
    const toVisiting = mismatchedLeads.filter(l => !l.followed_at).map(l => l.id);

    if (toFollowing.length > 0) {
      await supabase
        .from("campaign_leads")
        .update({
          status: "following",
          next_action_at: new Date(now.getTime() + 2 * 60000).toISOString(),
          updated_at: now.toISOString(),
        } as any)
        .in("id", toFollowing);
      mismatchedFixed += toFollowing.length;
    }

    if (toVisiting.length > 0) {
      await supabase
        .from("campaign_leads")
        .update({
          status: "visiting_profile",
          next_action_at: new Date(now.getTime() + 2 * 60000).toISOString(),
          updated_at: now.toISOString(),
        } as any)
        .in("id", toVisiting);
      mismatchedFixed += toVisiting.length;
    }

    issues.push({
      severity: "warning",
      area: "Status Inconsistente",
      description: `${mismatchedFixed} leads em 'ready' com histórico de visita reconciliados`,
      auto_fixed: true,
      details: `${toFollowing.length} → following, ${toVisiting.length} → visiting_profile`,
    });
  }

  stats.mismatched_status_fixed = mismatchedFixed;

  // ═══════════════════════════════════════════════════════
  // 2c. STATUS REGRESSION GUARD — auto-heal out-of-order completion effects
  // ═══════════════════════════════════════════════════════
  const progressionRules = [
    { from: "visiting_profile", to: "following", field: "followed_at" },
    { from: "following", to: "connection_sent", field: "connection_sent_at" },
    { from: "connection_sent", to: "connected", field: "connection_accepted_at" },
    { from: "dm_sent", to: "replied", field: "replied_at" },
  ] as const;

  let regressionHealed = 0;

  if (activeCampaignIds.length > 0) {
    for (const rule of progressionRules) {
      const { data: rows } = await supabase
        .from("campaign_leads")
        .select("id")
        .eq("status", rule.from)
        .not(rule.field, "is", null)
        .in("campaign_profile_id", activeCampaignIds)
        .limit(500);

      if (rows && rows.length > 0) {
        const ids = rows.map(r => r.id);
        await supabase
          .from("campaign_leads")
          .update({
            status: rule.to,
            next_action_at: new Date(now.getTime() + 2 * 60000).toISOString(),
            updated_at: now.toISOString(),
          } as any)
          .in("id", ids);

        regressionHealed += ids.length;
        issues.push({
          severity: "warning",
          area: "Regressão de Status",
          description: `${ids.length} leads reconciliados: ${rule.from} → ${rule.to}`,
          auto_fixed: true,
        });
      }
    }
  }

  stats.regression_healed = regressionHealed;

  // ═══════════════════════════════════════════════════════
  // 2d. ERROR RECOVERY — heal leads stuck in 'error' that have
  //     connection_accepted_at (DM send failed after acceptance)
  // ═══════════════════════════════════════════════════════
  if (activeCampaignIds.length > 0) {
    const { data: errorConnectedLeads } = await supabase
      .from("campaign_leads")
      .select("id")
      .eq("status", "error")
      .not("connection_accepted_at", "is", null)
      .in("campaign_profile_id", activeCampaignIds)
      .limit(500);

    if (errorConnectedLeads && errorConnectedLeads.length > 0) {
      const ids = errorConnectedLeads.map(r => r.id);
      await supabase
        .from("campaign_leads")
        .update({
          status: "connected",
          next_action_at: new Date(now.getTime() + 5 * 60000).toISOString(),
          retry_count: 0,
          updated_at: now.toISOString(),
        } as any)
        .in("id", ids);

      issues.push({
        severity: "warning",
        area: "Recuperação de Erro",
        description: `${ids.length} leads em 'error' com conexão aceita recuperados → connected`,
        auto_fixed: true,
      });
      stats.error_connected_recovered = ids.length;
    }
  }


  // 3. ORPHANED ACTIONS — clean only truly orphan pending actions
  // ═══════════════════════════════════════════════════════
  const twoHoursAgo = new Date(now.getTime() - 2 * 3600000).toISOString();
  const { data: staleDueActions } = await supabase
    .from("action_queue")
    .select("id, campaign_lead_id, action_type, user_id, created_at, scheduled_for")
    .eq("status", "pending")
    .lte("scheduled_for", twoHoursAgo)
    .limit(500);

  let orphanActionsCleaned = 0;

  if (staleDueActions && staleDueActions.length > 0) {
    const leadIds = Array.from(new Set(staleDueActions.map(a => a.campaign_lead_id).filter(Boolean)));

    let existingLeadIds = new Set<string>();
    if (leadIds.length > 0) {
      const { data: existingLeads } = await supabase
        .from("campaign_leads")
        .select("id")
        .in("id", leadIds);
      existingLeadIds = new Set((existingLeads || []).map(l => l.id));
    }

    const orphanActionIds = staleDueActions
      .filter(a => !existingLeadIds.has(a.campaign_lead_id))
      .map(a => a.id);

    if (orphanActionIds.length > 0) {
      await supabase
        .from("action_queue")
        .update({ status: "skipped", error_message: "watchdog: orphan pending action" } as any)
        .in("id", orphanActionIds);

      orphanActionsCleaned = orphanActionIds.length;
      issues.push({
        severity: "warning",
        area: "Fila de Ações",
        description: `${orphanActionIds.length} ações órfãs pendentes limpas`,
        auto_fixed: true,
      });
    }

    const overdueButValid = staleDueActions
      .filter(a => existingLeadIds.has(a.campaign_lead_id));

    if (overdueButValid.length > 0) {
      // Build a map of user_id → extension status from allExt (already fetched above)
      const extByUser = new Map((allExt || []).map(e => [e.user_id, e]));

      // Categorize actions
      const limitReachedIds: string[] = [];
      const rescheduleIds: string[] = [];
      const offlineIds: string[] = [];

      for (const action of overdueButValid) {
        const ext = extByUser.get(action.user_id);
        if (!ext) {
          offlineIds.push(action.id);
          continue;
        }

        // Check if extension is offline, paused, or outside business hours
        const isOffline = !ext.is_connected;
        const isPaused = !!ext.is_paused;
        const isLinkedInLoggedOut = !ext.linkedin_logged_in;

        // Check if outside active hours
        let outsideHours = false;
        if (ext.active_hours_start && ext.active_hours_end) {
          const nowHHMM = `${String(now.getUTCHours()).padStart(2,'0')}:${String(now.getUTCMinutes()).padStart(2,'0')}`;
          outsideHours = nowHHMM < ext.active_hours_start || nowHHMM >= ext.active_hours_end;
        }

        // Check if today is not an active day
        let inactiveDay = false;
        if (ext.active_days && ext.active_days.length > 0) {
          const dayNames = ['sun','mon','tue','wed','thu','fri','sat'];
          const todayDay = dayNames[now.getDay()];
          inactiveDay = !ext.active_days.includes(todayDay);
        }

        if (isOffline || isPaused || isLinkedInLoggedOut || outsideHours || inactiveDay) {
          offlineIds.push(action.id);
          continue;
        }

        // Check daily limits
        const actionType = action.action_type;
        let limitReached = false;

        if (actionType === "visit_profile" || actionType === "follow_profile") {
          limitReached = (ext.visits_today ?? 0) >= (ext.daily_limit_visits ?? 80);
        } else if (actionType === "send_connection_request") {
          limitReached = (ext.connection_requests_today ?? 0) >= (ext.daily_limit_connection_requests ?? 40);
        } else if (actionType === "send_dm" || actionType === "send_followup" || actionType === "send_message") {
          limitReached = (ext.messages_today ?? 0) >= (ext.daily_limit_messages ?? 100);
        }

        if (limitReached) {
          limitReachedIds.push(action.id);
        } else {
          rescheduleIds.push(action.id);
        }
      }

      // Only reschedule actions whose limits haven't been reached AND extension is online
      if (rescheduleIds.length > 0) {
        await supabase
          .from("action_queue")
          .update({
            scheduled_for: now.toISOString(),
            picked_up_at: null,
            error_message: null,
          } as any)
          .in("id", rescheduleIds);

        issues.push({
          severity: "info",
          area: "Fila de Ações",
          description: `${rescheduleIds.length} ações atrasadas (+2h) reagendadas para agora`,
          auto_fixed: true,
          details: "Ações reagendadas para execução imediata pela extensão.",
        });
      }

      // Log limit-reached and offline actions as info only
      const skippedCount = limitReachedIds.length + offlineIds.length;
      if (skippedCount > 0) {
        const reasons: string[] = [];
        if (limitReachedIds.length > 0) reasons.push(`${limitReachedIds.length} por limite diário`);
        if (offlineIds.length > 0) reasons.push(`${offlineIds.length} por extensão offline/pausada/fora do horário`);
        issues.push({
          severity: "info",
          area: "Fila de Ações",
          description: `${skippedCount} ações atrasadas ignoradas (${reasons.join(', ')})`,
          auto_fixed: false,
          details: "Serão processadas quando a extensão estiver online e dentro dos limites.",
        });
      }
    }
  }

  stats.stale_due_actions = staleDueActions?.length || 0;
  stats.stale_actions_cleaned = orphanActionsCleaned;

  // ═══════════════════════════════════════════════════════
  // 4. FAILED ACTIONS — actions that failed too many times
  // ═══════════════════════════════════════════════════════
  const oneDayAgo = new Date(now.getTime() - 24 * 3600000).toISOString();
  const deprecatedActionTypes = new Set(["like_post"]);

  const { data: failedActions } = await supabase
    .from("action_queue")
    .select("id, action_type, error_message, retry_count, max_retries")
    .eq("status", "failed")
    .gte("created_at", oneDayAgo)
    .limit(500);

  const terminalFailedActions = (failedActions || []).filter((a: any) => {
    if (deprecatedActionTypes.has(a.action_type)) return false;
    const retryCount = Number(a.retry_count ?? 0);
    const maxRetries = Number(a.max_retries ?? 3);
    return retryCount >= maxRetries;
  });

  const retriableFailedActions = (failedActions || []).filter((a: any) => {
    if (deprecatedActionTypes.has(a.action_type)) return false;
    const retryCount = Number(a.retry_count ?? 0);
    const maxRetries = Number(a.max_retries ?? 3);
    return retryCount < maxRetries;
  });

  if (terminalFailedActions.length > 5) {
    const errorSummary = terminalFailedActions
      .slice(0, 10)
      .map(a => `${a.action_type}: ${(a.error_message || 'unknown').slice(0, 80)}`)
      .join('; ');

    issues.push({
      severity: "critical",
      area: "Ações Falhadas",
      description: `${terminalFailedActions.length} ações falharam de forma terminal nas últimas 24h`,
      auto_fixed: false,
      details: errorSummary,
    });
  } else if (retriableFailedActions.length > 20) {
    issues.push({
      severity: "warning",
      area: "Ações Falhadas",
      description: `${retriableFailedActions.length} falhas transitórias nas últimas 24h (com retry pendente)`,
      auto_fixed: false,
      details: "Falhas ainda dentro do limite de tentativas; monitorando drenagem automática da fila.",
    });
  }

  stats.failed_actions_24h = terminalFailedActions.length;
  stats.failed_actions_24h_transient = retriableFailedActions.length;
  stats.failed_actions_24h_total = (failedActions || []).length;

  // ═══════════════════════════════════════════════════════
  // 5. CAMPAIGN HEALTH — active campaigns with 0 progress
  // ═══════════════════════════════════════════════════════
  const { data: activeCampaigns } = await supabase
    .from("campaign_profiles")
    .select("id, name, user_id, status")
    .eq("status", "active");

  let watchdogEnrichmentKicks = 0;
  let watchdogEnrichedLeads = 0;

  for (const campaign of activeCampaigns || []) {
    const { count: totalLeads } = await supabase
      .from("campaign_leads")
      .select("id", { count: "exact", head: true })
      .eq("campaign_profile_id", campaign.id);

    const { count: readyLeads } = await supabase
      .from("campaign_leads")
      .select("id", { count: "exact", head: true })
      .eq("campaign_profile_id", campaign.id)
      .eq("status", "ready")
      .is("next_action_at", null);

    // Leads stuck with no next_action_at
    if (readyLeads && readyLeads > 0) {
      await supabase
        .from("campaign_leads")
        .update({
          next_action_at: new Date(now.getTime() + 2 * 60000).toISOString(),
          updated_at: now.toISOString(),
        } as any)
        .eq("campaign_profile_id", campaign.id)
        .eq("status", "ready")
        .is("next_action_at", null);

      issues.push({
        severity: "warning",
        area: "Campanha",
        description: `"${campaign.name}": ${readyLeads} leads 'ready' sem next_action_at`,
        auto_fixed: true,
        details: `next_action_at definido para daqui 2min`,
      });
    }

    // Kick enrichment when campaign is active and has pending unenriched leads.
    const { count: pendingEnrichment } = await supabase
      .from("campaign_leads")
      .select("id", { count: "exact", head: true })
      .eq("campaign_profile_id", campaign.id)
      .eq("user_id", campaign.user_id)
      .is("profile_enriched_at", null)
      .in("source", ENRICHABLE_SOURCES)
      .in("status", ENRICHABLE_STATUSES);

    if (pendingEnrichment && pendingEnrichment > 0) {
      try {
        const enrichResp = await fetch(`${supabaseUrl}/functions/v1/enrich-leads-batch`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
            "x-internal-key": supabaseKey,
          },
          body: JSON.stringify({
            campaign_profile_id: campaign.id,
            user_id: campaign.user_id,
          }),
        });

        if (enrichResp.ok) {
          watchdogEnrichmentKicks++;
          const enrichPayload = await enrichResp.json().catch(() => null);
          const enrichedInBatch = Number(enrichPayload?.enriched || 0);
          watchdogEnrichedLeads += enrichedInBatch;

          if (enrichedInBatch > 0) {
            issues.push({
              severity: "info",
              area: "Enrichment",
              description: `"${campaign.name}": watchdog retomou enrichment (+${enrichedInBatch})`,
              auto_fixed: true,
              details: `${enrichPayload?.remaining ?? "?"} restantes`,
            });
          }
        } else {
          const errText = await enrichResp.text();
          issues.push({
            severity: "warning",
            area: "Enrichment",
            description: `"${campaign.name}": falha ao retomar enrichment (HTTP ${enrichResp.status})`,
            auto_fixed: false,
            details: errText.slice(0, 180),
          });
        }
      } catch (kickErr) {
        issues.push({
          severity: "warning",
          area: "Enrichment",
          description: `"${campaign.name}": erro ao retomar enrichment`,
          auto_fixed: false,
          details: String(kickErr),
        });
      }
    }

    stats[`campaign_${campaign.name}`] = {
      total: totalLeads || 0,
      ready_no_schedule: readyLeads || 0,
      pending_enrichment: pendingEnrichment || 0,
    };
  }

  stats.active_campaigns = activeCampaigns?.length || 0;
  stats.watchdog_enrichment_kicks = watchdogEnrichmentKicks;
  stats.watchdog_enriched_leads = watchdogEnrichedLeads;

  // ═══════════════════════════════════════════════════════
  // 6. ACTION QUEUE PICK-UP HEALTH — picked up but never completed
  // ═══════════════════════════════════════════════════════
  const thirtyMinAgo = new Date(now.getTime() - 30 * 60000).toISOString();
  const { data: zombieActions } = await supabase
    .from("action_queue")
    .select("id, action_type, picked_up_at")
    .eq("status", "in_progress")
    .lt("picked_up_at", thirtyMinAgo)
    .limit(100);

  if (zombieActions && zombieActions.length > 0) {
    const ids = zombieActions.map(a => a.id);
    await supabase
      .from("action_queue")
      .update({
        status: "pending",
        picked_up_at: null,
        retry_count: 0,
        error_message: "watchdog: reset zombie action",
      } as any)
      .in("id", ids);

    issues.push({
      severity: "warning",
      area: "Ações Zumbi",
      description: `${zombieActions.length} ações 'in_progress' há +30min resetadas`,
      auto_fixed: true,
    });
  }

  stats.zombie_actions_fixed = zombieActions?.length || 0;

  // ═══════════════════════════════════════════════════════
  // 7. API CONNECTIVITY CHECKS
  // ═══════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════
  // 8. LOOP DETECTION — leads reset 3+ times without progress
  // ═══════════════════════════════════════════════════════
  const { data: loopingLeads } = await supabase
    .from("campaign_leads")
    .select("id, user_id, linkedin_url, status, retry_count, full_name")
    .gte("retry_count", 3)
    .in("status", ["ready", "visiting_profile", "enriching", "generating_messages"])
    .limit(50);

  if (loopingLeads && loopingLeads.length > 0) {
    // Mark them as error to stop the loop
    const ids = loopingLeads.map(l => l.id);
    await supabase
      .from("campaign_leads")
      .update({
        status: "error",
        error_message: "watchdog: stuck in loop (reset 3+ times without progress)",
        updated_at: now.toISOString(),
      } as any)
      .in("id", ids);

    issues.push({
      severity: "critical",
      area: "Loop Detectado",
      description: `${loopingLeads.length} leads presos em loop (3+ resets sem progresso)`,
      auto_fixed: true,
      details: `Marcados como 'error'. Exemplos: ${loopingLeads.slice(0, 3).map(l => l.full_name || l.linkedin_url?.slice(0, 30)).join(', ')}`,
    });
  }

  stats.looping_leads_fixed = loopingLeads?.length || 0;

  // ═══════════════════════════════════════════════════════
  // 9. GENERATE-DM FAILURE MONITORING
  // ═══════════════════════════════════════════════════════
  // Check for leads that need messages but keep waiting too long
  const twoHoursAgoIso = new Date(now.getTime() - 2 * 3600000).toISOString();
  const { count: dmFailCount } = await supabase
    .from("campaign_leads")
    .select("id", { count: "exact", head: true })
    .eq("status", "visiting_profile")
    .is("connection_note", null)
    .is("dm_text", null)
    .not("profile_enriched_at", "is", null)
    .lt("updated_at", twoHoursAgoIso);

  const twentyMinutesAgoIso = new Date(now.getTime() - 20 * 60000).toISOString();
  const { count: dmRecentCount } = await supabase
    .from("campaign_leads")
    .select("id", { count: "exact", head: true })
    .not("messages_generated_at", "is", null)
    .gte("messages_generated_at", twentyMinutesAgoIso);

  if (dmFailCount && dmFailCount > 3) {
    const hasRecentDmProgress = (dmRecentCount || 0) >= 3;

    if (hasRecentDmProgress) {
      issues.push({
        severity: "warning",
        area: "Generate-DM em Fila",
        description: `${dmFailCount} leads enriquecidos há +2h ainda aguardando mensagem`,
        auto_fixed: false,
        details: `${dmRecentCount} leads processados nos últimos 20min. Fila em drenagem via cron.`,
      });
    } else {
      issues.push({
        severity: "critical",
        area: "Generate-DM Falhando",
        description: `${dmFailCount} leads enriquecidos há +2h sem mensagens geradas`,
        auto_fixed: false,
        details: "Sem progresso recente na geração de DMs. Verificar edge function generate-dm/generate-dm-cron.",
      });
    }
  }

  stats.dm_generation_failures = dmFailCount || 0;
  stats.dm_generated_last_20m = dmRecentCount || 0;

  // ═══════════════════════════════════════════════════════
  // 9b. ACTION FAILURE RATE — detect systematic failures per action_type
  //     Catches issues like "Connect button not found" (LinkedIn layout change)
  // ═══════════════════════════════════════════════════════
  const sixHoursAgo = new Date(now.getTime() - 6 * 3600000).toISOString();
  const { data: recentActions } = await supabase
    .from("action_queue")
    .select("action_type, status, error_message")
    .gte("created_at", sixHoursAgo)
    .in("status", ["completed", "failed"])
    .limit(1000);

  if (recentActions && recentActions.length > 0) {
    // Group by action_type and compute failure rates
    const typeStats: Record<string, { total: number; failed: number; errors: Record<string, number> }> = {};
    for (const a of recentActions) {
      if (!typeStats[a.action_type]) typeStats[a.action_type] = { total: 0, failed: 0, errors: {} };
      typeStats[a.action_type].total++;
      if (a.status === "failed") {
        typeStats[a.action_type].failed++;
        const errKey = (a.error_message || "unknown").slice(0, 80);
        typeStats[a.action_type].errors[errKey] = (typeStats[a.action_type].errors[errKey] || 0) + 1;
      }
    }

    for (const [actionType, s] of Object.entries(typeStats)) {
      if (s.total < 3) continue; // not enough data
      const failRate = s.failed / s.total;

      if (failRate >= 0.8) {
        const topError = Object.entries(s.errors).sort((a, b) => b[1] - a[1])[0];
        issues.push({
          severity: "critical",
          area: "Taxa de Falha Sistêmica",
          description: `${actionType}: ${Math.round(failRate * 100)}% de falha (${s.failed}/${s.total}) nas últimas 6h`,
          auto_fixed: false,
          details: topError ? `Erro principal: "${topError[0]}" (${topError[1]}x)` : undefined,
        });

        // Auto-fix: if ALL recent actions of this type failed with the same error,
        // reset the failed ones to pending so they can retry after a code fix is deployed
        if (failRate === 1 && topError && topError[1] === s.failed) {
          const { data: toReset } = await supabase
            .from("action_queue")
            .select("id")
            .eq("status", "failed")
            .eq("action_type", actionType)
            .gte("created_at", sixHoursAgo)
            .limit(100);

          if (toReset && toReset.length > 0) {
            const resetIds = toReset.map((r: any) => r.id);
            await supabase
              .from("action_queue")
              .update({
                status: "pending",
                error_message: null,
                retry_count: 0,
                scheduled_for: new Date(now.getTime() + 30 * 60000).toISOString(),
              } as any)
              .in("id", resetIds);

            issues.push({
              severity: "info",
              area: "Auto-Retry Sistêmico",
              description: `${resetIds.length} ações ${actionType} resetadas para retry em 30min`,
              auto_fixed: true,
              details: `100% falha com mesmo erro — resetadas automaticamente aguardando fix.`,
            });
          }
        }
      } else if (failRate >= 0.5) {
        const topError = Object.entries(s.errors).sort((a, b) => b[1] - a[1])[0];
        issues.push({
          severity: "warning",
          area: "Taxa de Falha Elevada",
          description: `${actionType}: ${Math.round(failRate * 100)}% de falha (${s.failed}/${s.total}) nas últimas 6h`,
          auto_fixed: false,
          details: topError ? `Erro principal: "${topError[0]}" (${topError[1]}x)` : undefined,
        });
      }
    }

    stats.action_failure_rates = Object.fromEntries(
      Object.entries(typeStats).map(([k, v]) => [k, { total: v.total, failed: v.failed, rate: Math.round(v.failed / v.total * 100) + "%" }])
    );
  }

  // ═══════════════════════════════════════════════════════
  // 9c. GHOST GUARD SPIKE — detect sudden increase in ghost-skipped leads
  //     Catches false positive issues with the Ghost Guard JIT check
  // ═══════════════════════════════════════════════════════
  const { count: recentGhostCount } = await supabase
    .from("campaign_leads")
    .select("id", { count: "exact", head: true })
    .eq("status", "skipped")
    .eq("profile_quality_status", "ghost")
    .gte("updated_at", sixHoursAgo);

  const { count: totalActiveLeads } = await supabase
    .from("campaign_leads")
    .select("id", { count: "exact", head: true })
    .in("status", ["ready", "visiting_profile", "following", "connection_sent", "connected", "dm_sent"]);

  const ghostRate = (totalActiveLeads && totalActiveLeads > 0) ? (recentGhostCount || 0) / totalActiveLeads : 0;

  if ((recentGhostCount || 0) > 5 && ghostRate > 0.05) {
    issues.push({
      severity: "critical",
      area: "Ghost Guard Spike",
      description: `${recentGhostCount} leads marcados como ghost nas últimas 6h (${Math.round(ghostRate * 100)}% dos ativos)`,
      auto_fixed: false,
      details: "Possível falso positivo no Ghost Guard. Verificar extensão — seção runProfileQualityCheck.",
    });
  } else if ((recentGhostCount || 0) > 2) {
    issues.push({
      severity: "info",
      area: "Ghost Guard",
      description: `${recentGhostCount} leads marcados como ghost nas últimas 6h`,
      auto_fixed: false,
    });
  }

  stats.ghost_detections_6h = recentGhostCount || 0;
  stats.ghost_rate = Math.round(ghostRate * 10000) / 100 + "%";

  // ═══════════════════════════════════════════════════════
  // 9d. PIPELINE VELOCITY — detect if warming pipeline has stalled
  //     Catches issues where actions are scheduled but nothing executes
  // ═══════════════════════════════════════════════════════
  for (const ext of extensions || []) {
    if (!ext.is_connected || ext.is_paused) continue;

    // Check completed warming actions in last 6 hours
    const { count: completedWarming } = await supabase
      .from("action_queue")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ext.user_id)
      .in("action_type", ["visit_profile", "follow_profile"])
      .eq("status", "completed")
      .gte("completed_at", sixHoursAgo);

    // Check pending warming actions that are past due
    const { count: pendingPastDue } = await supabase
      .from("action_queue")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ext.user_id)
      .in("action_type", ["visit_profile", "follow_profile"])
      .eq("status", "pending")
      .lte("scheduled_for", now.toISOString());

    if ((completedWarming === 0 || completedWarming === null) && (pendingPastDue || 0) > 5) {
      issues.push({
        severity: "critical",
        area: "Pipeline Parado",
        description: `User ${ext.user_id.slice(0, 8)}…: 0 ações de warming completadas em 6h com ${pendingPastDue} pendentes atrasadas`,
        auto_fixed: false,
        details: "Extensão online mas pipeline não está fluindo. Verificar aba LinkedIn, cooldown, ou erro na extensão.",
      });
    } else if ((completedWarming || 0) > 0 && (completedWarming || 0) < 10) {
      issues.push({
        severity: "info",
        area: "Pipeline Lento",
        description: `User ${ext.user_id.slice(0, 8)}…: apenas ${completedWarming} ações de warming em 6h`,
        auto_fixed: false,
      });
    }

    stats[`pipeline_${ext.user_id.slice(0, 8)}`] = {
      completed_warming_6h: completedWarming || 0,
      pending_past_due: pendingPastDue || 0,
    };
  }

  // ═══════════════════════════════════════════════════════
  // 10. STALE CONNECTION_SENT — pending connections > 10 days
  // ═══════════════════════════════════════════════════════
  const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 3600000).toISOString();
  const { data: staleConnections } = await supabase
    .from("campaign_leads")
    .select("id, full_name, linkedin_url")
    .eq("status", "connection_sent")
    .lt("connection_sent_at", tenDaysAgo)
    .limit(200);

  if (staleConnections && staleConnections.length > 0) {
    const ids = staleConnections.map(l => l.id);
    await supabase
      .from("campaign_leads")
      .update({
        status: "connection_rejected",
        error_message: "watchdog: no response after 10 days",
        updated_at: now.toISOString(),
      } as any)
      .in("id", ids);

    issues.push({
      severity: "info",
      area: "Conexões Expiradas",
      description: `${staleConnections.length} conexões sem resposta há +10 dias marcadas como rejeitadas`,
      auto_fixed: true,
    });
  }

  stats.stale_connections_closed = staleConnections?.length || 0;

  // ═══════════════════════════════════════════════════════
  // 11. IDLE EXTENSION — online but no actions for 2h+
  // ═══════════════════════════════════════════════════════
  const twoHoursAgoTs = new Date(now.getTime() - 2 * 3600000).toISOString();
  for (const ext of extensions || []) {
    if (!ext.is_connected || ext.is_paused) continue;

    const lastBeat = ext.last_heartbeat_at ? new Date(ext.last_heartbeat_at) : null;
    const isOnline = lastBeat && (now.getTime() - lastBeat.getTime()) < 120000;
    if (!isOnline) continue;

    const lastAction = ext.last_action_at ? new Date(ext.last_action_at) : null;
    if (!lastAction) continue; // avoid false positives for newly connected extensions

    const hoursSinceAction = (now.getTime() - lastAction.getTime()) / 3600000;

    if (hoursSinceAction > 2) {
      // Check if there are pending actions for this user
      const { count: pendingCount } = await supabase
        .from("action_queue")
        .select("id", { count: "exact", head: true })
        .eq("user_id", ext.user_id)
        .eq("status", "pending")
        .lte("scheduled_for", now.toISOString());

      if (pendingCount && pendingCount > 0) {
        issues.push({
          severity: "warning",
          area: "Extensão Ociosa",
          description: `User ${ext.user_id.slice(0, 8)}… online mas sem ações há ${Math.round(hoursSinceAction)}h (${pendingCount} pendentes)`,
          auto_fixed: false,
          details: "Extensão conectada mas não está executando ações. Possível problema na aba do LinkedIn.",
        });
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  const criticals = issues.filter(i => i.severity === "critical");
  const warnings = issues.filter(i => i.severity === "warning");
  const autoFixed = issues.filter(i => i.auto_fixed);

  // Only send email if there are critical issues or non-auto-fixed warnings
  const actionableIssues = issues.filter(i => i.severity === "critical" || (i.severity === "warning" && !i.auto_fixed));
  const shouldEmail = actionableIssues.length > 0;

  if (shouldEmail && resendKey) {
    const timestamp = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

    const issueRows = issues.map(i => {
      const color = i.severity === "critical" ? "#dc2626" : i.severity === "warning" ? "#d97706" : "#2563eb";
      const icon = i.severity === "critical" ? "🔴" : i.severity === "warning" ? "🟡" : "🔵";
      const fixBadge = i.auto_fixed
        ? '<span style="background:#16a34a;color:white;padding:2px 6px;border-radius:4px;font-size:10px;margin-left:6px">AUTO-CORRIGIDO</span>'
        : '<span style="background:#dc2626;color:white;padding:2px 6px;border-radius:4px;font-size:10px;margin-left:6px">REQUER ATENÇÃO</span>';
      return `
        <tr>
          <td style="padding:10px;border-bottom:1px solid #eee">${icon} <strong style="color:${color}">${i.area}</strong></td>
          <td style="padding:10px;border-bottom:1px solid #eee">${i.description}${fixBadge}</td>
          <td style="padding:10px;border-bottom:1px solid #eee;font-size:12px;color:#666">${i.details || '-'}</td>
        </tr>`;
    }).join("");

    const statsRows = Object.entries(stats).map(([k, v]) =>
      `<tr><td style="padding:4px 10px;font-size:13px;color:#555">${k}</td><td style="padding:4px 10px;font-size:13px">${typeof v === 'object' ? JSON.stringify(v) : v}</td></tr>`
    ).join("");

    const subjectEmoji = criticals.length > 0 ? "🔴" : "🟡";
    const subject = `${subjectEmoji} Watchdog: ${criticals.length} crítico(s), ${warnings.length} aviso(s), ${autoFixed.length} auto-corrigido(s)`;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:white">
        <div style="background:${criticals.length > 0 ? '#fef2f2' : '#fffbeb'};padding:20px;border-radius:8px 8px 0 0">
          <h2 style="margin:0;color:${criticals.length > 0 ? '#dc2626' : '#d97706'}">
            ${subjectEmoji} LinkedIn Copilot — Watchdog Report
          </h2>
          <p style="margin:8px 0 0;color:#666">${timestamp} (Horário de Brasília)</p>
        </div>

        <div style="padding:20px">
          <div style="display:flex;gap:16px;margin-bottom:20px">
            <div style="background:#fef2f2;padding:12px 20px;border-radius:8px;text-align:center;flex:1">
              <div style="font-size:24px;font-weight:bold;color:#dc2626">${criticals.length}</div>
              <div style="font-size:12px;color:#666">Críticos</div>
            </div>
            <div style="background:#fffbeb;padding:12px 20px;border-radius:8px;text-align:center;flex:1">
              <div style="font-size:24px;font-weight:bold;color:#d97706">${warnings.length}</div>
              <div style="font-size:12px;color:#666">Avisos</div>
            </div>
            <div style="background:#f0fdf4;padding:12px 20px;border-radius:8px;text-align:center;flex:1">
              <div style="font-size:24px;font-weight:bold;color:#16a34a">${autoFixed.length}</div>
              <div style="font-size:12px;color:#666">Auto-corrigidos</div>
            </div>
          </div>

          <h3 style="margin:20px 0 10px">📋 Problemas Detectados</h3>
          <table style="width:100%;border-collapse:collapse">
            <tr style="background:#f9fafb">
              <th style="padding:10px;text-align:left;font-size:13px">Área</th>
              <th style="padding:10px;text-align:left;font-size:13px">Descrição</th>
              <th style="padding:10px;text-align:left;font-size:13px">Detalhes</th>
            </tr>
            ${issueRows}
          </table>

          <h3 style="margin:20px 0 10px">📊 Métricas</h3>
          <table style="width:100%;border-collapse:collapse">
            ${statsRows}
          </table>
        </div>

        <div style="padding:15px 20px;background:#f9fafb;border-radius:0 0 8px 8px;text-align:center">
          <p style="margin:0;font-size:11px;color:#999">Watchdog automático — LinkedIn Copilot • Executado a cada 30min</p>
        </div>
      </div>
    `;

    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "LinkedIn Copilot <onboarding@resend.dev>",
          to: [ALERT_EMAIL],
          subject,
          html,
        }),
      });
    } catch (emailErr) {
      console.error("Failed to send watchdog email:", emailErr);
    }
  }

  return new Response(JSON.stringify({
    timestamp: now.toISOString(),
    issues_found: issues.length,
    criticals: criticals.length,
    warnings: warnings.length,
    auto_fixed: autoFixed.length,
    stats,
    issues,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
