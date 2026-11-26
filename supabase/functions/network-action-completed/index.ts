// network-action-completed
// Called by the Chrome extension after it runs an action whose action_data.module === "network".
// Auth: the user's Supabase JWT (the extension is logged in). Service key also accepted (tests).
//
// Action types handled:
//   network_search_people      result: { profiles: [...], has_next, limit_reached? }
//                              (purpose "connections": the user's own 1st-degree contacts, see contacts-search)
//   network_search_posts       result: { posts: [...] }
//   network_sync_connections   result: { connections: [profile_url...], pending: [profile_url...] }
//   network_withdraw_invites   result: { withdrawn: [profile_url...], not_found: [profile_url...] }
//   send_connection_request    (module network) result: { note: 'sent_without_note' | 'already_connected' | 'already_pending' }
//   post_comment               (module network) result: { posted: boolean }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, corsHeaders, effectiveUserId, json, unauthorized } from "../_shared/auth.ts";
import {
  buildConnectionsSearchUrl, buildSalesNavConnectionsSearchUrl, fireAndForget, normalizeProfileUrl, postFingerprint, startOfNextMonthUtc, samePost,
} from "../_shared/network.ts";

// Fit scores: 80+ strong, 60+ likely, 30+ possible (the contact picker's own bands). Under this, the
// analysis said the person has nothing to do with what the user described.
const NOT_A_FIT_BELOW = 30;

// deno-lint-ignore no-explicit-any
type Supa = any;

const LIMIT_RE = /LINKEDIN_LIMIT|invitation limit|weekly invitation|too many|temporarily restricted|you've reached/i;
const SEARCH_LIMIT_RE = /COMMERCIAL_USE_LIMIT|commercial use limit|limite de uso comercial/i;

function toInt(v: unknown): number | null {
  if (v == null) return null;
  const n = parseInt(String(v).replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

/** A Sales Navigator page could not be used (no license, layout change, nothing readable).
 *  Fall back to the regular LinkedIn search for 24h so prospecting never stops. */
const TRANSIENT_RE = /no tab with id|tab was closed|content script timeout|receiving end does not exist|message port closed|frame .* (removed|detached)|extension context invalidated/i;

function salesNavUnusable(action: any, success: boolean, result: any, errorMessage: string | null = null): boolean {
  if (action?.action_data?.reader !== "sales_navigator") return false;
  if (result?.sales_nav_unavailable === true) return true;
  // The tab closing or the computer going to sleep mid-search says nothing about Sales Navigator:
  // the run just fails and the next one tries Sales Navigator again.
  if (TRANSIENT_RE.test(errorMessage || "")) return false;
  return !success && result?.limit_reached !== true;
}

async function markSalesNavFailed(supabase: Supa, userId: string, action: any, result: any, errorMessage: string | null) {
  console.warn("sales navigator search unusable, falling back to regular search", {
    user: userId.slice(0, 8), reason: result?.reason || errorMessage || null, debug: result?.debug || null,
  });
  await supabase.from("extension_status").update({ sales_nav_failed_at: new Date().toISOString() }).eq("user_id", userId);
}

async function handleSearchPeople(supabase: Supa, userId: string, action: any, success: boolean, result: any, errorMessage: string | null) {
  const data = action.action_data || {};
  const runId = data.search_run_id || null;
  const icpId = data.icp_id || null;
  const now = new Date().toISOString();
  const limitHit = result?.limit_reached === true || SEARCH_LIMIT_RE.test(errorMessage || "");

  if (salesNavUnusable(action, success, result, errorMessage)) {
    await markSalesNavFailed(supabase, userId, action, result, errorMessage);
    // Not counted against the monthly budget: the next scheduler run uses the regular search.
    if (runId) await supabase.from("network_search_runs").delete().eq("id", runId).eq("user_id", userId);
    return { ok: true, sales_nav_fallback: true };
  }

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
  const fromSalesNav = data.reader === "sales_navigator";

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
      source: fromSalesNav ? "sales_navigator" : "linkedin_search",
      search_run_id: runId,
      raw: {
        snippet: p.snippet ? String(p.snippet).slice(0, 600) : null,
        ...(fromSalesNav ? { recently_posted: p.recently_posted === true, changed_jobs: p.changed_jobs === true } : {}),
      },
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
  // A regular search run only because Sales Navigator was set aside for a day is a stopgap: its pages do
  // not line up with the Sales Navigator ones and it may read nothing. It must not close the ICP for two
  // weeks or move the page counter; Sales Navigator decides that when it is back.
  let stopgap = false;
  if (!fromSalesNav) {
    const { data: ext } = await supabase.from("extension_status").select("linkedin_account_tier").eq("user_id", userId).maybeSingle();
    stopgap = ext?.linkedin_account_tier === "sales_navigator";
  }
  if (icpId) {
    await supabase.from("icps").update(stopgap ? { last_people_search_at: now } : {
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

/** People search over the user's own connections (purpose "connections", from contacts-search). */
async function handleConnectionsSearch(supabase: Supa, userId: string, action: any, success: boolean, result: any, errorMessage: string | null) {
  const data = action.action_data || {};
  const runId = data.search_run_id || null;
  const campaignId = data.campaign_id || null;
  const now = new Date().toISOString();
  const limitHit = result?.limit_reached === true || SEARCH_LIMIT_RE.test(errorMessage || "");

  if (salesNavUnusable(action, success, result, errorMessage)) {
    await markSalesNavFailed(supabase, userId, action, result, errorMessage);
    // Retry the same keyword and page right away with the regular LinkedIn search.
    const kw = Array.isArray(data.keywords) ? String(data.keywords[Number(data.kw_index) || 0] || "") : "";
    const page = Number(data.page) || 1;
    if (kw && runId) {
      const url = buildConnectionsSearchUrl(kw, page);
      await supabase.from("network_search_runs").update({ search_url: url }).eq("id", runId).eq("user_id", userId);
      const { reader: _r, posted_recently: _p, ...rest } = data;
      await supabase.from("action_queue").insert({
        user_id: userId,
        action_type: "network_search_people",
        linkedin_url: url,
        priority: 3,
        status: "pending",
        scheduled_for: new Date(Date.now() + (30 + Math.random() * 30) * 1000).toISOString(),
        action_data: { ...rest, search_url: url },
      });
    } else if (runId) {
      await supabase.from("network_search_runs").update({ status: "failed", completed_at: now }).eq("id", runId).eq("user_id", userId);
    }
    return { ok: true, sales_nav_fallback: true };
  }

  if (!success || limitHit) {
    if (limitHit) {
      await supabase.from("extension_status").update({ searches_paused_until: startOfNextMonthUtc() }).eq("user_id", userId);
    }
    if (runId) {
      await supabase.from("network_search_runs").update({ status: limitHit ? "limit_reached" : "failed", completed_at: now })
        .eq("id", runId).eq("user_id", userId);
    }
    return { ok: true, limit_reached: limitHit };
  }

  const profiles: any[] = Array.isArray(result?.profiles) ? result.profiles.slice(0, 50) : [];
  const rows = [];
  for (const p of profiles) {
    const url = normalizeProfileUrl(p.profile_url);
    if (!url) continue;
    const degree = String(p.degree || "").toLowerCase();
    if (degree && !degree.startsWith("1")) continue; // only real connections
    rows.push({
      user_id: userId,
      linkedin_url: url,
      full_name: p.name ? String(p.name).slice(0, 200) : null,
      headline: p.headline ? String(p.headline).slice(0, 500) : null,
      company: p.current_company ? String(p.current_company).slice(0, 200) : null,
      location: p.location ? String(p.location).slice(0, 200) : null,
      source: "linkedin_search",
      updated_at: now,
    });
  }
  let saved = 0;
  if (rows.length) {
    // Keep data from the official export (it has the exact position) when we already have it.
    const { data: ins, error } = await supabase.from("linkedin_connections")
      .upsert(rows, { onConflict: "user_id,linkedin_url", ignoreDuplicates: true })
      .select("id");
    if (error) console.error("connection insert failed:", error);
    saved = ins?.length || 0;
  }

  const page = Number(data.page) || 1;
  const maxPages = Math.max(1, Math.min(5, Number(data.max_pages) || 2));
  const keywords: string[] = Array.isArray(data.keywords) ? data.keywords.map(String) : [];
  const kwIndex = Math.max(0, Number(data.kw_index) || 0);
  const searchesLeft = Number.isFinite(Number(data.searches_left)) ? Number(data.searches_left) : 0;
  const keywordDone = result?.has_next === false || profiles.length === 0 || page >= maxPages;
  if (runId) {
    await supabase.from("network_search_runs").update({
      status: "completed", completed_at: now, results_count: profiles.length, new_count: saved,
    }).eq("id", runId).eq("user_id", userId);
  }

  // Next page of this keyword, or the next keyword, while the search allowance lasts.
  let next: { kw: number; page: number } | null = null;
  if (searchesLeft > 0 && campaignId) {
    if (!keywordDone) next = { kw: kwIndex, page: page + 1 };
    else if (kwIndex + 1 < keywords.length) next = { kw: kwIndex + 1, page: 1 };
  }
  if (next) {
    const url = data.reader === "sales_navigator"
      ? buildSalesNavConnectionsSearchUrl(keywords[next.kw], next.page, { postedRecently: data.posted_recently === true })
      : buildConnectionsSearchUrl(keywords[next.kw], next.page);
    const { data: run } = await supabase.from("network_search_runs").insert({
      user_id: userId, campaign_profile_id: campaignId, kind: "connections", page: next.page, search_url: url,
      query: keywords[next.kw].slice(0, 400), status: "queued",
    }).select("id").single();
    const delayMs = (45 + Math.random() * 75) * 1000;
    await supabase.from("action_queue").insert({
      user_id: userId,
      action_type: "network_search_people",
      linkedin_url: url,
      priority: 3,
      status: "pending",
      scheduled_for: new Date(Date.now() + delayMs).toISOString(),
      action_data: {
        ...data, search_run_id: run?.id || null, search_url: url,
        page: next.page, kw_index: next.kw, searches_left: searchesLeft - 1,
      },
    });
  }
  const exhausted = !next;

  if (saved > 0 && campaignId) fireAndForget("contacts-match", { op: "score", user_id: userId, campaign_id: campaignId });
  return { ok: true, found: profiles.length, saved, exhausted };
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
  const myNetwork = data.source === "my_network";

  // One touch per person per week: skip authors who already have a draft waiting or a comment
  // recorded in the last 7 days (whatever found the post: this search or the contact-by-contact check).
  const busyAuthors = new Set<string>();
  if (myNetwork) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { data: recent, error: recentErr } = await supabase.from("monitored_posts").select("author_profile_url, status, commented_at")
      .eq("user_id", userId).in("status", ["pending", "approved", "queued", "posted"])
      .order("created_at", { ascending: false }).limit(500);
    for (const r of recent || []) {
      if (r.status === "posted" && !(r.commented_at && r.commented_at >= weekAgo)) continue;
      const u = normalizeProfileUrl(r.author_profile_url);
      if (u) busyAuthors.add(u);
    }
    const { data: leadsBusy, error: leadsBusyErr } = await supabase.from("campaign_leads").select("linkedin_url")
      .eq("user_id", userId).eq("status", "comment_review").limit(500);
    // Without these lists an author with a draft already waiting would get a second one: store nothing.
    if (recentErr || leadsBusyErr) {
      console.error("busy authors lookup failed:", recentErr || leadsBusyErr);
      if (runId) await supabase.from("network_search_runs").update({ status: "failed", completed_at: now }).eq("id", runId).eq("user_id", userId);
      return { ok: true };
    }
    for (const r of leadsBusy || []) { const u = normalizeProfileUrl(r.linkedin_url); if (u) busyAuthors.add(u); }
  }

  // Posts already stored for these authors, in any state. The contact-by-contact check stores a post
  // under another key, so the unique key alone does not stop the same post from entering twice, and a
  // post the user skipped there must not come back from here.
  const seenByAuthor = new Map<string, string[]>();
  {
    const authors = [...new Set(posts.map((p) => normalizeProfileUrl(p?.author_profile_url)).filter((u): u is string => !!u))];
    if (authors.length) {
      // Every stored post of these authors, page by page: a cut-off list would let an old post back in.
      // deno-lint-ignore no-explicit-any
      const stored: any[] = [];
      // deno-lint-ignore no-explicit-any
      let storedErr: any = null;
      // Read until a page comes back empty, so the result does not depend on how many rows the API
      // returns per request.
      for (let from = 0; ; ) {
        const { data: page, error } = await supabase.from("monitored_posts")
          .select("author_profile_url, post_text").eq("user_id", userId).in("author_profile_url", authors)
          .order("created_at", { ascending: false }).order("id", { ascending: true }).range(from, from + 999);
        if (error) { storedErr = error; break; }
        if (!page || page.length === 0) break;
        stored.push(...page);
        from += page.length;
        if (from > 20000) { storedErr = new Error("stored posts list too long to read"); break; }
      }
      // Without this list nothing can be told apart from what is already there: store nothing this run.
      if (storedErr) {
        console.error("stored posts lookup failed:", storedErr);
        if (runId) await supabase.from("network_search_runs").update({ status: "failed", completed_at: now }).eq("id", runId).eq("user_id", userId);
        return { ok: true };
      }
      for (const r of stored) {
        const u = normalizeProfileUrl(r.author_profile_url);
        if (!u || !r.post_text) continue;
        (seenByAuthor.get(u) || seenByAuthor.set(u, []).get(u)!).push(String(r.post_text));
      }
    }
  }

  // Contacts the user's own analysis found unrelated to their business (best fit score under
  // NOT_A_FIT_BELOW in every list): their posts are left alone even when the subject matches. Authors
  // never analyzed are kept, and so is everyone when this lookup fails: it narrows, it does not guard.
  const notAFit = new Set<string>();
  let skippedNotAFit = 0;
  if (myNetwork) {
    try {
      const authors = [...new Set(posts.map((p) => normalizeProfileUrl(p?.author_profile_url)).filter((u): u is string => !!u))];
      if (authors.length) {
        const { data: known, error: knownErr } = await supabase.from("linkedin_connections")
          .select("id, linkedin_url").eq("user_id", userId).in("linkedin_url", authors);
        if (knownErr) throw knownErr;
        const ids = (known || []).map((k) => k.id);
        if (ids.length) {
          const { data: scores, error: scoresErr } = await supabase.from("connection_matches")
            .select("connection_id, score, reason").eq("user_id", userId).in("connection_id", ids)
            // Highest first: if the list is ever cut short, what is lost are low scores, and a person
            // is only skipped when their BEST score is low.
            .order("score", { ascending: false }).limit(1000);
          if (scoresErr) throw scoresErr;
          const best = new Map<string, number>();
          for (const s of scores || []) {
            // A 0 with no reason is a placeholder (the analysis returned nothing for that person),
            // not a judgment: such a contact counts as never analyzed.
            if (!(Number(s.score) > 0) && !String(s.reason || "").trim()) continue;
            best.set(s.connection_id, Math.max(best.get(s.connection_id) ?? -1, Number(s.score) || 0));
          }
          for (const k of known || []) {
            const b = best.get(k.id);
            const u = normalizeProfileUrl(k.linkedin_url);
            if (u && b !== undefined && b < NOT_A_FIT_BELOW) notAFit.add(u);
          }
        }
      }
    } catch (e) {
      console.error("fit lookup failed, keeping every author:", e);
      notAFit.clear();
    }
  }

  const rows = [];
  for (const p of posts) {
    let urn = typeof p.urn === "string" ? p.urn.trim() : "";
    const authorUrl = normalizeProfileUrl(p.author_profile_url);
    if (ownUrl && authorUrl === ownUrl) continue; // never comment on our own posts
    if (!authorUrl) continue; // company pages / unknown authors: skip
    if (!p.text || String(p.text).trim().length < 40) continue;
    if ((seenByAuthor.get(authorUrl) || []).some((t) => samePost(t, String(p.text)))) continue;
    let postUrl = `https://www.linkedin.com/feed/update/${urn}/`;
    if (!/^urn:li:(activity|share|ugcPost):/i.test(urn)) {
      // The 2026 search page carries no post id. The post is identified by its author and its
      // opening words, and opened through the author's activity page (same as the Growth flow).
      if (!myNetwork) continue;
      const fp = postFingerprint(String(p.text));
      const slug = authorUrl.split("/in/")[1] || "";
      if (!fp || !slug) continue;
      urn = `lc:${slug}:${fp.slice(0, 60)}`;
      postUrl = `${authorUrl}/recent-activity/all/#lcpost=${encodeURIComponent(fp.slice(0, 40))}`;
    }
    if (myNetwork) {
      if (p.author_degree && !/^1/.test(String(p.author_degree))) continue; // connections only
      if (notAFit.has(authorUrl)) { skippedNotAFit++; continue; }
      if (busyAuthors.has(authorUrl)) continue;
      busyAuthors.add(authorUrl); // at most one post per author per search
    }
    rows.push({
      user_id: userId,
      icp_id: icpId,
      post_urn: urn,
      post_url: postUrl,
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
  if (skippedNotAFit) console.log(`my_network: ${skippedNotAFit} post(s) left alone, author analyzed as not a fit`);
  return { ok: true, found: posts.length, new: inserted, not_a_fit: skippedNotAFit };
}

async function handleConnectionRequest(supabase: Supa, userId: string, action: any, success: boolean, result: any, errorMessage: string | null) {
  const prospectId = action.action_data?.prospect_id;
  if (!prospectId) return { ok: false, error: "prospect_id missing" };
  const now = new Date().toISOString();
  const { data: prospect } = await supabase.from("network_prospects")
    .select("id, raw, degree").eq("id", prospectId).eq("user_id", userId).maybeSingle();
  if (!prospect) return { ok: false, error: "prospect not found" };

  if (success) {
    const note = String(result?.note || "");
    // Extensions up to 0.6.4 answer "already_connected" whenever the profile has a Message button and no
    // Connect control. That is also what a 3rd-degree profile looks like, so the answer is only believed
    // for someone who was not found as 2nd or 3rd degree.
    const far = /^(2|3)/.test(String(prospect.degree || ""));
    if (note === "connect_unavailable" || (note === "already_connected" && far)) {
      await supabase.from("network_prospects").update({
        status: "skipped", last_error: "no Connect control on the profile (not sent)",
      }).eq("id", prospectId);
    } else if (note === "already_connected") {
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
    // They join the "New connections" list, so their posts are read like any contact's (unless the
    // user turned that off). A failure here does not undo the acceptance; it is logged.
    if (rows?.length) {
      const { data: added, error: addErr } = await supabase.rpc("add_accepted_to_list", {
        p_user_id: userId, p_prospect_ids: rows.map((r: { id: string }) => r.id),
      });
      if (addErr) console.error("add_accepted_to_list failed:", addErr.message);
      else if (added) console.log(`${added} new connection(s) added to the list`);
    }
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
  // one automatic retry, then it stays failed and visible in the dashboard
  await supabase.from("monitored_posts").update({
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
      case "network_search_people":
        out = action.action_data?.purpose === "connections"
          ? await handleConnectionsSearch(supabase, userId, action, success, result, errorMessage)
          : await handleSearchPeople(supabase, userId, action, success, result, errorMessage);
        break;
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
