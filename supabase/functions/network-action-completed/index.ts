// network-action-completed
// Called by the Chrome extension after it runs an action whose action_data.module === "network".
// Auth: the user's Supabase JWT (the extension is logged in). Service key also accepted (tests).
//
// Action types handled:
//   network_search_people      result: { profiles: [...], has_next, limit_reached? }
//   network_search_posts       result: { posts: [...] }
//   network_sync_connections   result: { connections: [profile_url...], pending: [profile_url...] }
//   network_withdraw_invites   result: { withdrawn: [profile_url...], not_found: [profile_url...] }
//   send_connection_request    (module network) result: { note: 'sent_without_note' | 'already_connected' | 'already_pending' }
//   post_comment               (module network) result: { posted: boolean }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, corsHeaders, effectiveUserId, json, unauthorized } from "../_shared/auth.ts";
import { fireAndForget, normalizeProfileUrl, startOfNextMonthUtc } from "../_shared/network.ts";

// deno-lint-ignore no-explicit-any
type Supa = any;

const LIMIT_RE = /LINKEDIN_LIMIT|invitation limit|weekly invitation|too many|temporarily restricted|you've reached/i;
const SEARCH_LIMIT_RE = /COMMERCIAL_USE_LIMIT|commercial use limit|limite de uso comercial/i;

function toInt(v: unknown): number | null {
  if (v == null) return null;
  const n = parseInt(String(v).replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

async function handleSearchPeople(supabase: Supa, userId: string, action: any, success: boolean, result: any, errorMessage: string | null) {
  const data = action.action_data || {};
  const runId = data.search_run_id || null;
  const icpId = data.icp_id || null;
  const now = new Date().toISOString();
  const limitHit = result?.limit_reached === true || SEARCH_LIMIT_RE.test(errorMessage || "");

  if (!success || limitHit) {
    if (limitHit) {
      await supabase.from("extension_status").update({ searches_paused_until: startOfNextMonthUtc() }).eq("user_id", userId);
    }
    if (runId) {
      await supabase.from("network_search_runs").update({
        status: limitHit ? "limit_reached" : "failed", completed_at: now,
      }).eq("id", runId).eq("user_id", userId);
    }
    return { ok: true, limit_reached: limitHit };
  }

  const profiles: any[] = Array.isArray(result?.profiles) ? result.profiles.slice(0, 50) : [];
  let inserted = 0;
  const rows = [];
  for (const p of profiles) {
    const url = normalizeProfileUrl(p.profile_url);
    if (!url) continue;
    const degree = String(p.degree || "").toLowerCase();
    const alreadyConnected = degree.startsWith("1") || p.is_connected === true;
    const pending = p.is_pending === true;
    rows.push({
      user_id: userId,
      icp_id: icpId,
      linkedin_url: url,
      full_name: p.name ? String(p.name).slice(0, 200) : null,
      headline: p.headline ? String(p.headline).slice(0, 500) : null,
      location: p.location ? String(p.location).slice(0, 200) : null,
      current_company: p.current_company ? String(p.current_company).slice(0, 200) : null,
      degree: p.degree ? String(p.degree).slice(0, 10) : null,
      mutual_connections: toInt(p.mutual_connections),
      status: alreadyConnected || pending ? "skipped" : "discovered",
      last_error: alreadyConnected ? "already connected" : pending ? "invite already pending" : null,
      source: "linkedin_search",
      search_run_id: runId,
      raw: { snippet: p.snippet ? String(p.snippet).slice(0, 600) : null },
    });
  }
  if (rows.length) {
    // ignoreDuplicates: never overwrite someone we already know (invited/accepted/etc.)
    const { data: ins, error } = await supabase.from("network_prospects")
      .upsert(rows, { onConflict: "user_id,linkedin_url", ignoreDuplicates: true })
      .select("id");
    if (error) console.error("prospect insert failed:", error);
    inserted = ins?.length || 0;
  }

  const page = Number(data.page) || 1;
  const exhausted = result?.has_next === false || profiles.length === 0 || page >= 100;
  if (icpId) {
    await supabase.from("icps").update({
      people_search_page: exhausted ? 0 : page,
      people_search_exhausted_at: exhausted ? now : null,
      last_people_search_at: now,
    }).eq("id", icpId).eq("user_id", userId);
  }
  if (runId) {
    await supabase.from("network_search_runs").update({
      status: "completed", completed_at: now, results_count: profiles.length, new_count: inserted,
    }).eq("id", runId).eq("user_id", userId);
  }
  if (inserted > 0) fireAndForget("network-process", { user_id: userId });
  return { ok: true, found: profiles.length, new: inserted, exhausted };
}

async function handleSearchPosts(supabase: Supa, userId: string, action: any, success: boolean, result: any) {
  const data = action.action_data || {};
  const runId = data.search_run_id || null;
  const icpId = data.icp_id || null;
  const now = new Date().toISOString();
  if (!success) {
    if (runId) await supabase.from("network_search_runs").update({ status: "failed", completed_at: now }).eq("id", runId).eq("user_id", userId);
    return { ok: true };
  }
  const ownUrl = normalizeProfileUrl(result?.own_profile_url);
  const posts: any[] = Array.isArray(result?.posts) ? result.posts.slice(0, 40) : [];
  const rows = [];
  for (const p of posts) {
    const urn = typeof p.urn === "string" ? p.urn.trim() : "";
    if (!/^urn:li:(activity|share|ugcPost):/i.test(urn)) continue;
    const authorUrl = normalizeProfileUrl(p.author_profile_url);
    if (ownUrl && authorUrl === ownUrl) continue; // never comment on our own posts
    if (!authorUrl) continue; // company pages / unknown authors: skip
    if (!p.text || String(p.text).trim().length < 40) continue;
    rows.push({
      user_id: userId,
      icp_id: icpId,
      post_urn: urn,
      post_url: `https://www.linkedin.com/feed/update/${urn}/`,
      author_name: p.author_name ? String(p.author_name).slice(0, 200) : null,
      author_headline: p.author_headline ? String(p.author_headline).slice(0, 500) : null,
      author_profile_url: authorUrl,
      author_degree: p.author_degree ? String(p.author_degree).slice(0, 10) : null,
      post_text: String(p.text).slice(0, 5000),
      posted_label: p.posted_label ? String(p.posted_label).slice(0, 40) : null,
      reactions_count: toInt(p.reactions),
      comments_count: toInt(p.comments),
      status: "new",
      search_run_id: runId,
    });
  }
  let inserted = 0;
  if (rows.length) {
    const { data: ins, error } = await supabase.from("monitored_posts")
      .upsert(rows, { onConflict: "user_id,post_urn", ignoreDuplicates: true })
      .select("id");
    if (error) console.error("post insert failed:", error);
    inserted = ins?.length || 0;
  }
  if (icpId) await supabase.from("icps").update({ last_post_search_at: now }).eq("id", icpId).eq("user_id", userId);
  if (runId) {
    await supabase.from("network_search_runs").update({
      status: "completed", completed_at: now, results_count: posts.length, new_count: inserted,
    }).eq("id", runId).eq("user_id", userId);
  }
  if (inserted > 0) fireAndForget("network-process", { user_id: userId });
  return { ok: true, found: posts.length, new: inserted };
}

async function handleConnectionRequest(supabase: Supa, userId: string, action: any, success: boolean, result: any, errorMessage: string | null) {
  const prospectId = action.action_data?.prospect_id;
  if (!prospectId) return { ok: false, error: "prospect_id missing" };
  const now = new Date().toISOString();
  const { data: prospect } = await supabase.from("network_prospects")
    .select("id, raw").eq("id", prospectId).eq("user_id", userId).maybeSingle();
  if (!prospect) return { ok: false, error: "prospect not found" };

  if (success) {
    const note = String(result?.note || "");
    if (note === "already_connected") {
      await supabase.from("network_prospects").update({ status: "skipped", last_error: "already connected" }).eq("id", prospectId);
    } else {
      await supabase.from("network_prospects").update({
        status: "invited", invited_at: now, last_error: note === "already_pending" ? "was already pending" : null,
      }).eq("id", prospectId);
    }
    if (result?.limitWarning) {
      await supabase.from("extension_status")
        .update({ invites_paused_until: new Date(Date.now() + 48 * 3600 * 1000).toISOString() }).eq("user_id", userId);
    }
    return { ok: true };
  }

  const msg = errorMessage || "unknown error";
  if (LIMIT_RE.test(msg)) {
    // LinkedIn invite limit: put the person back in line and pause invites for 3 days.
    await supabase.from("extension_status")
      .update({ invites_paused_until: new Date(Date.now() + 72 * 3600 * 1000).toISOString() }).eq("user_id", userId);
    await supabase.from("network_prospects").update({ status: "qualified", last_error: msg.slice(0, 300) }).eq("id", prospectId);
    await supabase.from("action_queue").update({ status: "cancelled", error_message: "network: invites paused (LinkedIn limit)" })
      .eq("user_id", userId).eq("status", "pending").eq("action_type", "send_connection_request")
      .contains("action_data", { module: "network" });
    return { ok: true, limit_reached: true };
  }
  const attempts = (Number(prospect.raw?.attempts) || 0) + 1;
  await supabase.from("network_prospects").update({
    status: attempts >= 2 ? "failed" : "qualified",
    last_error: msg.slice(0, 300),
    raw: { ...(prospect.raw || {}), attempts },
  }).eq("id", prospectId);
  return { ok: true, attempts };
}

async function handleSync(supabase: Supa, userId: string, success: boolean, result: any) {
  const now = new Date().toISOString();
  if (!success) return { ok: true };
  const connections = new Set<string>(
    (Array.isArray(result?.connections) ? result.connections : []).map((u: string) => normalizeProfileUrl(u)).filter(Boolean),
  );
  let accepted = 0;
  if (connections.size) {
    const { data: rows, error } = await supabase.from("network_prospects")
      .update({ status: "accepted", accepted_at: now })
      .eq("user_id", userId)
      .in("status", ["invited", "withdrawn"])
      .in("linkedin_url", Array.from(connections))
      .select("id");
    if (error) console.error("accept update failed:", error);
    accepted = rows?.length || 0;
  }
  await supabase.from("extension_status").update({ last_connections_sync_at: now }).eq("user_id", userId);
  return { ok: true, accepted };
}

async function handleWithdraw(supabase: Supa, userId: string, action: any, success: boolean, result: any) {
  const now = new Date().toISOString();
  const requested: string[] = (action.action_data?.profile_urls || []).map((u: string) => normalizeProfileUrl(u)).filter(Boolean);
  const withdrawn: string[] = success
    ? (Array.isArray(result?.withdrawn) ? result.withdrawn : []).map((u: string) => normalizeProfileUrl(u)).filter(Boolean)
    : [];
  const notFound: string[] = success
    ? (Array.isArray(result?.not_found) ? result.not_found : []).map((u: string) => normalizeProfileUrl(u)).filter(Boolean)
    : [];
  if (withdrawn.length) {
    await supabase.from("network_prospects").update({ status: "withdrawn", withdrawn_at: now })
      .eq("user_id", userId).eq("status", "invited").in("linkedin_url", withdrawn);
  }
  if (notFound.length) {
    // Not in "sent invitations" anymore: either accepted or ignored/declined. The next
    // connections sync will flip accepted ones; mark the rest withdrawn so we stop retrying.
    await supabase.from("network_prospects").update({ status: "withdrawn", withdrawn_at: now, last_error: "invite no longer pending" })
      .eq("user_id", userId).eq("status", "invited").in("linkedin_url", notFound);
  }
  return { ok: true, requested: requested.length, withdrawn: withdrawn.length, not_found: notFound.length };
}

async function handleComment(supabase: Supa, userId: string, action: any, success: boolean, result: any, errorMessage: string | null) {
  const postId = action.action_data?.post_id;
  if (!postId) return { ok: false, error: "post_id missing" };
  const now = new Date().toISOString();
  if (success && result?.posted !== false) {
    await supabase.from("monitored_posts").update({ status: "posted", commented_at: now, last_error: null })
      .eq("id", postId).eq("user_id", userId);
    return { ok: true };
  }
  const { data: post } = await supabase.from("monitored_posts").select("last_error").eq("id", postId).eq("user_id", userId).maybeSingle();
  const alreadyRetried = String(post?.last_error || "").startsWith("[retry]");
  await supabase.from("monitored_posts").update({
    // one automatic retry, then it stays failed and visible in the dashboard
    status: alreadyRetried ? "failed" : "approved",
    last_error: `${alreadyRetried ? "" : "[retry] "}${(errorMessage || (result?.posted === false ? "comment not confirmed" : "unknown error")).slice(0, 300)}`,
  }).eq("id", postId).eq("user_id", userId);
  return { ok: true, retried: !alreadyRetried };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await authenticate(req, { allowService: true, allowUser: true });
  if (!auth) return unauthorized();

  try {
    const body = await req.json().catch(() => ({}));
    const actionId = typeof body.action_queue_id === "string" ? body.action_queue_id : null;
    if (!actionId) return json({ error: "action_queue_id required" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let q = supabase.from("action_queue").select("*").eq("id", actionId);
    const scopedUser = effectiveUserId(auth, body.user_id);
    if (auth.kind === "user") q = q.eq("user_id", auth.userId);
    const { data: action, error } = await q.maybeSingle();
    if (error) throw error;
    if (!action) return json({ error: "action not found" }, 404);
    if (action.action_data?.module !== "network") return json({ error: "not a network action" }, 400);
    const userId: string = action.user_id;
    if (scopedUser && scopedUser !== userId) return json({ error: "action not found" }, 404);

    const success = body.success === true;
    const result = body.result && typeof body.result === "object" ? body.result : null;
    const errorMessage = typeof body.error_message === "string" ? body.error_message : null;

    // Mirror final state on the queue row (the extension already does this; keep it idempotent).
    await supabase.from("action_queue").update({
      status: success ? "completed" : "failed",
      completed_at: new Date().toISOString(),
      error_message: errorMessage,
    }).eq("id", actionId).in("status", ["pending", "in_progress", "completed", "failed"]);

    let out: unknown;
    switch (action.action_type) {
      case "network_search_people": out = await handleSearchPeople(supabase, userId, action, success, result, errorMessage); break;
      case "network_search_posts": out = await handleSearchPosts(supabase, userId, action, success, result); break;
      case "network_sync_connections": out = await handleSync(supabase, userId, success, result); break;
      case "network_withdraw_invites": out = await handleWithdraw(supabase, userId, action, success, result); break;
      case "send_connection_request": out = await handleConnectionRequest(supabase, userId, action, success, result, errorMessage); break;
      case "post_comment": out = await handleComment(supabase, userId, action, success, result, errorMessage); break;
      default: return json({ error: `unsupported action ${action.action_type}` }, 400);
    }

    await supabase.from("activity_log").insert({
      user_id: userId,
      action: `network_${action.action_type.replace(/^network_/, "")}_${success ? "completed" : "failed"}`,
      details: { action_queue_id: actionId, outcome: out, error: errorMessage },
    });
    return json({ success: true, outcome: out });
  } catch (e) {
    console.error("network-action-completed error:", e);
    return json({ error: "internal_error" }, 500);
  }
});
