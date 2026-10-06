export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      action_queue: {
        Row: {
          action_data: Json | null
          action_type: string
          campaign_id: string | null
          campaign_lead_id: string | null
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          linkedin_url: string | null
          message_text: string | null
          picked_up_at: string | null
          priority: number | null
          result: Json | null
          retry_count: number | null
          scheduled_for: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          action_data?: Json | null
          action_type: string
          campaign_id?: string | null
          campaign_lead_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          linkedin_url?: string | null
          message_text?: string | null
          picked_up_at?: string | null
          priority?: number | null
          result?: Json | null
          retry_count?: number | null
          scheduled_for?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          action_data?: Json | null
          action_type?: string
          campaign_id?: string | null
          campaign_lead_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          linkedin_url?: string | null
          message_text?: string | null
          picked_up_at?: string | null
          priority?: number | null
          result?: Json | null
          retry_count?: number | null
          scheduled_for?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      activity_log: {
        Row: {
          action: string
          campaign_lead_id: string | null
          created_at: string | null
          details: Json | null
          id: string
          user_id: string
        }
        Insert: {
          action: string
          campaign_lead_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          campaign_lead_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_campaign_lead_id_fkey"
            columns: ["campaign_lead_id"]
            isOneToOne: false
            referencedRelation: "campaign_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_leads: {
        Row: {
          apollo_person_id: string | null
          approved_at: string | null
          campaign_profile_id: string
          comment_approved: boolean
          comment_approved_at: string | null
          comment_generated_at: string | null
          comment_posted_at: string | null
          comment_text: string | null
          company: string | null
          connected_at: string | null
          connection_accepted_at: string | null
          connection_note: string | null
          connection_sent_at: string | null
          connection_verification_note: string | null
          connection_verified: boolean | null
          connection_verified_at: string | null
          created_at: string | null
          custom_dm: string | null
          custom_followup: string | null
          dm_approved: boolean | null
          dm_approved_at: string | null
          dm_edited_by_user: boolean | null
          dm_generated_at: string | null
          dm_sent_at: string | null
          dm_text: string | null
          dm_variant: string | null
          engagement_count: number
          enrich_retry_count: number | null
          enrichment_source: string | null
          error_message: string | null
          first_name: string | null
          follow_up_text: string | null
          followed_at: string | null
          followup_due_at: string | null
          followup_sent_at: string | null
          full_name: string | null
          icp_checked_at: string | null
          icp_match: boolean | null
          icp_match_reason: string | null
          id: string
          industry: string | null
          last_engagement_at: string | null
          last_name: string | null
          linkedin_event_id: string | null
          linkedin_url: string
          location: string | null
          messages_generated_at: string | null
          next_action_at: string | null
          post_content: string | null
          post_liked_at: string | null
          post_url: string | null
          profile_about: string | null
          profile_current_company: string | null
          profile_current_title: string | null
          profile_education: string | null
          profile_enriched_at: string | null
          profile_headline: string | null
          profile_previous_company: string | null
          profile_previous_title: string | null
          profile_quality_checked_at: string | null
          profile_quality_note: string | null
          profile_quality_status: string | null
          profile_skills: string[] | null
          profile_snapshot: Json | null
          profile_visited_at: string | null
          replied_at: string | null
          reply_classified_at: string | null
          reply_detected_at: string | null
          reply_intent: string | null
          reply_sentiment: string | null
          reply_text: string | null
          retry_count: number | null
          sequence_step: number | null
          snapshot_id: string | null
          source: string | null
          status: string | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          apollo_person_id?: string | null
          approved_at?: string | null
          campaign_profile_id: string
          comment_approved?: boolean
          comment_approved_at?: string | null
          comment_generated_at?: string | null
          comment_posted_at?: string | null
          comment_text?: string | null
          company?: string | null
          connected_at?: string | null
          connection_accepted_at?: string | null
          connection_note?: string | null
          connection_sent_at?: string | null
          connection_verification_note?: string | null
          connection_verified?: boolean | null
          connection_verified_at?: string | null
          created_at?: string | null
          custom_dm?: string | null
          custom_followup?: string | null
          dm_approved?: boolean | null
          dm_approved_at?: string | null
          dm_edited_by_user?: boolean | null
          dm_generated_at?: string | null
          dm_sent_at?: string | null
          dm_text?: string | null
          dm_variant?: string | null
          engagement_count?: number
          enrich_retry_count?: number | null
          enrichment_source?: string | null
          error_message?: string | null
          first_name?: string | null
          follow_up_text?: string | null
          followed_at?: string | null
          followup_due_at?: string | null
          followup_sent_at?: string | null
          full_name?: string | null
          icp_checked_at?: string | null
          icp_match?: boolean | null
          icp_match_reason?: string | null
          id?: string
          industry?: string | null
          last_engagement_at?: string | null
          last_name?: string | null
          linkedin_event_id?: string | null
          linkedin_url: string
          location?: string | null
          messages_generated_at?: string | null
          next_action_at?: string | null
          post_content?: string | null
          post_liked_at?: string | null
          post_url?: string | null
          profile_about?: string | null
          profile_current_company?: string | null
          profile_current_title?: string | null
          profile_education?: string | null
          profile_enriched_at?: string | null
          profile_headline?: string | null
          profile_previous_company?: string | null
          profile_previous_title?: string | null
          profile_quality_checked_at?: string | null
          profile_quality_note?: string | null
          profile_quality_status?: string | null
          profile_skills?: string[] | null
          profile_snapshot?: Json | null
          profile_visited_at?: string | null
          replied_at?: string | null
          reply_classified_at?: string | null
          reply_detected_at?: string | null
          reply_intent?: string | null
          reply_sentiment?: string | null
          reply_text?: string | null
          retry_count?: number | null
          sequence_step?: number | null
          snapshot_id?: string | null
          source?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          apollo_person_id?: string | null
          approved_at?: string | null
          campaign_profile_id?: string
          comment_approved?: boolean
          comment_approved_at?: string | null
          comment_generated_at?: string | null
          comment_posted_at?: string | null
          comment_text?: string | null
          company?: string | null
          connected_at?: string | null
          connection_accepted_at?: string | null
          connection_note?: string | null
          connection_sent_at?: string | null
          connection_verification_note?: string | null
          connection_verified?: boolean | null
          connection_verified_at?: string | null
          created_at?: string | null
          custom_dm?: string | null
          custom_followup?: string | null
          dm_approved?: boolean | null
          dm_approved_at?: string | null
          dm_edited_by_user?: boolean | null
          dm_generated_at?: string | null
          dm_sent_at?: string | null
          dm_text?: string | null
          dm_variant?: string | null
          engagement_count?: number
          enrich_retry_count?: number | null
          enrichment_source?: string | null
          error_message?: string | null
          first_name?: string | null
          follow_up_text?: string | null
          followed_at?: string | null
          followup_due_at?: string | null
          followup_sent_at?: string | null
          full_name?: string | null
          icp_checked_at?: string | null
          icp_match?: boolean | null
          icp_match_reason?: string | null
          id?: string
          industry?: string | null
          last_engagement_at?: string | null
          last_name?: string | null
          linkedin_event_id?: string | null
          linkedin_url?: string
          location?: string | null
          messages_generated_at?: string | null
          next_action_at?: string | null
          post_content?: string | null
          post_liked_at?: string | null
          post_url?: string | null
          profile_about?: string | null
          profile_current_company?: string | null
          profile_current_title?: string | null
          profile_education?: string | null
          profile_enriched_at?: string | null
          profile_headline?: string | null
          profile_previous_company?: string | null
          profile_previous_title?: string | null
          profile_quality_checked_at?: string | null
          profile_quality_note?: string | null
          profile_quality_status?: string | null
          profile_skills?: string[] | null
          profile_snapshot?: Json | null
          profile_visited_at?: string | null
          replied_at?: string | null
          reply_classified_at?: string | null
          reply_detected_at?: string | null
          reply_intent?: string | null
          reply_sentiment?: string | null
          reply_text?: string | null
          retry_count?: number | null
          sequence_step?: number | null
          snapshot_id?: string | null
          source?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_leads_campaign_profile_id_fkey"
            columns: ["campaign_profile_id"]
            isOneToOne: false
            referencedRelation: "campaign_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_profiles: {
        Row: {
          apollo_search_config: Json | null
          auto_approve_dms: boolean | null
          campaign_angle: string | null
          campaign_mode: string
          campaign_objective: string
          created_at: string | null
          custom_vertical: boolean | null
          dm_example: string | null
          dm_tone: string
          generic_titles_no_filter: boolean | null
          icp_company_size_max: number | null
          icp_company_size_min: number | null
          icp_description: string | null
          icp_employee_ranges: string[] | null
          icp_exclude_keywords: string[] | null
          icp_industries: string[] | null
          icp_job_titles: string[] | null
          icp_keywords: string[] | null
          icp_locations: string[] | null
          icp_titles: string[] | null
          id: string
          is_default: boolean | null
          is_template: boolean | null
          lead_source: string | null
          message_language: string
          name: string
          pain_points: string[] | null
          proof_points: string | null
          stage_connection_approved: boolean
          stage_dm_approved: boolean
          stage_followup_approved: boolean
          status: string | null
          updated_at: string | null
          user_id: string
          value_proposition: string | null
          vertical_id: string | null
        }
        Insert: {
          apollo_search_config?: Json | null
          auto_approve_dms?: boolean | null
          campaign_angle?: string | null
          campaign_mode?: string
          campaign_objective?: string
          created_at?: string | null
          custom_vertical?: boolean | null
          dm_example?: string | null
          dm_tone?: string
          generic_titles_no_filter?: boolean | null
          icp_company_size_max?: number | null
          icp_company_size_min?: number | null
          icp_description?: string | null
          icp_employee_ranges?: string[] | null
          icp_exclude_keywords?: string[] | null
          icp_industries?: string[] | null
          icp_job_titles?: string[] | null
          icp_keywords?: string[] | null
          icp_locations?: string[] | null
          icp_titles?: string[] | null
          id?: string
          is_default?: boolean | null
          is_template?: boolean | null
          lead_source?: string | null
          message_language?: string
          name: string
          pain_points?: string[] | null
          proof_points?: string | null
          stage_connection_approved?: boolean
          stage_dm_approved?: boolean
          stage_followup_approved?: boolean
          status?: string | null
          updated_at?: string | null
          user_id: string
          value_proposition?: string | null
          vertical_id?: string | null
        }
        Update: {
          apollo_search_config?: Json | null
          auto_approve_dms?: boolean | null
          campaign_angle?: string | null
          campaign_mode?: string
          campaign_objective?: string
          created_at?: string | null
          custom_vertical?: boolean | null
          dm_example?: string | null
          dm_tone?: string
          generic_titles_no_filter?: boolean | null
          icp_company_size_max?: number | null
          icp_company_size_min?: number | null
          icp_description?: string | null
          icp_employee_ranges?: string[] | null
          icp_exclude_keywords?: string[] | null
          icp_industries?: string[] | null
          icp_job_titles?: string[] | null
          icp_keywords?: string[] | null
          icp_locations?: string[] | null
          icp_titles?: string[] | null
          id?: string
          is_default?: boolean | null
          is_template?: boolean | null
          lead_source?: string | null
          message_language?: string
          name?: string
          pain_points?: string[] | null
          proof_points?: string | null
          stage_connection_approved?: boolean
          stage_dm_approved?: boolean
          stage_followup_approved?: boolean
          status?: string | null
          updated_at?: string | null
          user_id?: string
          value_proposition?: string | null
          vertical_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_profiles_vertical_id_fkey"
            columns: ["vertical_id"]
            isOneToOne: false
            referencedRelation: "verticals"
            referencedColumns: ["id"]
          },
        ]
      }
      extension_status: {
        Row: {
          actions_today: number | null
          active_days: string[] | null
          active_hours_end: string | null
          active_hours_start: string | null
          auto_paused_at: string | null
          auto_paused_reason: string | null
          browser_fingerprint: string | null
          connection_requests_today: number | null
          created_at: string | null
          daily_comment_limit: number | null
          daily_limit_connection_requests: number | null
          daily_limit_messages: number | null
          daily_limit_visits: number | null
          health_checked_at: string | null
          health_issues: Json | null
          health_score: number | null
          health_status: string | null
          id: string
          invites_paused_until: string | null
          is_connected: boolean | null
          is_paused: boolean | null
          last_action_at: string | null
          last_connections_sync_at: string | null
          last_heartbeat_at: string | null
          last_limit_reset_at: string | null
          linkedin_account_tier: string | null
          linkedin_tier_detected_at: string | null
          sales_nav_failed_at: string | null
          linkedin_logged_in: boolean | null
          linkedin_profile_url: string | null
          messages_today: number | null
          monthly_people_search_budget: number | null
          searches_paused_until: string | null
          timezone: string | null
          updated_at: string | null
          user_id: string | null
          visits_today: number | null
          weekly_invite_limit: number | null
        }
        Insert: {
          actions_today?: number | null
          active_days?: string[] | null
          active_hours_end?: string | null
          active_hours_start?: string | null
          auto_paused_at?: string | null
          auto_paused_reason?: string | null
          browser_fingerprint?: string | null
          connection_requests_today?: number | null
          created_at?: string | null
          daily_comment_limit?: number | null
          daily_limit_connection_requests?: number | null
          daily_limit_messages?: number | null
          daily_limit_visits?: number | null
          health_checked_at?: string | null
          health_issues?: Json | null
          health_score?: number | null
          health_status?: string | null
          id?: string
          invites_paused_until?: string | null
          is_connected?: boolean | null
          is_paused?: boolean | null
          last_action_at?: string | null
          last_connections_sync_at?: string | null
          last_heartbeat_at?: string | null
          last_limit_reset_at?: string | null
          linkedin_account_tier?: string | null
          linkedin_tier_detected_at?: string | null
          sales_nav_failed_at?: string | null
          linkedin_logged_in?: boolean | null
          linkedin_profile_url?: string | null
          messages_today?: number | null
          monthly_people_search_budget?: number | null
          searches_paused_until?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_id?: string | null
          visits_today?: number | null
          weekly_invite_limit?: number | null
        }
        Update: {
          actions_today?: number | null
          active_days?: string[] | null
          active_hours_end?: string | null
          active_hours_start?: string | null
          auto_paused_at?: string | null
          auto_paused_reason?: string | null
          browser_fingerprint?: string | null
          connection_requests_today?: number | null
          created_at?: string | null
          daily_comment_limit?: number | null
          daily_limit_connection_requests?: number | null
          daily_limit_messages?: number | null
          daily_limit_visits?: number | null
          health_checked_at?: string | null
          health_issues?: Json | null
          health_score?: number | null
          health_status?: string | null
          id?: string
          invites_paused_until?: string | null
          is_connected?: boolean | null
          is_paused?: boolean | null
          last_action_at?: string | null
          last_connections_sync_at?: string | null
          last_heartbeat_at?: string | null
          last_limit_reset_at?: string | null
          linkedin_account_tier?: string | null
          linkedin_tier_detected_at?: string | null
          sales_nav_failed_at?: string | null
          linkedin_logged_in?: boolean | null
          linkedin_profile_url?: string | null
          messages_today?: number | null
          monthly_people_search_budget?: number | null
          searches_paused_until?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_id?: string | null
          visits_today?: number | null
          weekly_invite_limit?: number | null
        }
        Relationships: []
      }
      generated_messages: {
        Row: {
          connection_note: string | null
          created_at: string
          dm_variant: string | null
          dm1: string | null
          event_id: string | null
          followup1: string | null
          id: string
          reasoning_short: string | null
          user_id: string
          variant_meta: Json | null
        }
        Insert: {
          connection_note?: string | null
          created_at?: string
          dm_variant?: string | null
          dm1?: string | null
          event_id?: string | null
          followup1?: string | null
          id?: string
          reasoning_short?: string | null
          user_id: string
          variant_meta?: Json | null
        }
        Update: {
          connection_note?: string | null
          created_at?: string
          dm_variant?: string | null
          dm1?: string | null
          event_id?: string | null
          followup1?: string | null
          id?: string
          reasoning_short?: string | null
          user_id?: string
          variant_meta?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "generated_messages_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "linkedin_events"
            referencedColumns: ["id"]
          },
        ]
      }
      ghost_profiles: {
        Row: {
          detected_at: string | null
          id: string
          linkedin_url: string
          raw_data: Json | null
          reason: string
          signal_count: number | null
          source: string | null
        }
        Insert: {
          detected_at?: string | null
          id?: string
          linkedin_url: string
          raw_data?: Json | null
          reason?: string
          signal_count?: number | null
          source?: string | null
        }
        Update: {
          detected_at?: string | null
          id?: string
          linkedin_url?: string
          raw_data?: Json | null
          reason?: string
          signal_count?: number | null
          source?: string | null
        }
        Relationships: []
      }
      google_connections: {
        Row: {
          created_at: string
          gmail_watch_enabled: boolean | null
          google_refresh_token: string | null
          id: string
          sheet_id: string | null
          sheet_tab_name: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          gmail_watch_enabled?: boolean | null
          google_refresh_token?: string | null
          id?: string
          sheet_id?: string | null
          sheet_tab_name?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          gmail_watch_enabled?: boolean | null
          google_refresh_token?: string | null
          id?: string
          sheet_id?: string | null
          sheet_tab_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
      icps: {
        Row: {
          company_size_max: number | null
          company_size_min: number | null
          created_at: string
          description: string | null
          engagement_enabled: boolean
          exclude_keywords: string[]
          id: string
          industries: string[]
          is_active: boolean
          keywords: string[]
          last_people_search_at: string | null
          last_post_search_at: string | null
          location_geo_ids: string[]
          locations: string[]
          min_fit_score: number
          name: string
          people_search_exhausted_at: string | null
          people_search_page: number
          post_topics: string[]
          recently_posted: boolean
          changed_jobs: boolean
          prospecting_enabled: boolean
          seniorities: string[]
          titles: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          company_size_max?: number | null
          company_size_min?: number | null
          created_at?: string
          description?: string | null
          engagement_enabled?: boolean
          exclude_keywords?: string[]
          id?: string
          industries?: string[]
          is_active?: boolean
          keywords?: string[]
          last_people_search_at?: string | null
          last_post_search_at?: string | null
          location_geo_ids?: string[]
          locations?: string[]
          min_fit_score?: number
          name: string
          people_search_exhausted_at?: string | null
          people_search_page?: number
          post_topics?: string[]
          recently_posted?: boolean
          changed_jobs?: boolean
          prospecting_enabled?: boolean
          seniorities?: string[]
          titles?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          company_size_max?: number | null
          company_size_min?: number | null
          created_at?: string
          description?: string | null
          engagement_enabled?: boolean
          exclude_keywords?: string[]
          id?: string
          industries?: string[]
          is_active?: boolean
          keywords?: string[]
          last_people_search_at?: string | null
          last_post_search_at?: string | null
          location_geo_ids?: string[]
          locations?: string[]
          min_fit_score?: number
          name?: string
          people_search_exhausted_at?: string | null
          people_search_page?: number
          post_topics?: string[]
          recently_posted?: boolean
          changed_jobs?: boolean
          prospecting_enabled?: boolean
          seniorities?: string[]
          titles?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      jobs: {
        Row: {
          created_at: string
          error: string | null
          event_id: string | null
          id: string
          status: string | null
          type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_id?: string | null
          id?: string
          status?: string | null
          type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          event_id?: string | null
          id?: string
          status?: string | null
          type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "linkedin_events"
            referencedColumns: ["id"]
          },
        ]
      }
      linkedin_events: {
        Row: {
          campaign_profile_id: string | null
          company: string | null
          created_at: string
          detected_at: string | null
          dm_sent_at: string | null
          dm_status: string | null
          email_message_id: string | null
          id: string
          last_followup_at: string | null
          linkedin_url: string | null
          name: string
          notes: string | null
          source: string | null
          status: string
          title: string | null
          user_id: string
        }
        Insert: {
          campaign_profile_id?: string | null
          company?: string | null
          created_at?: string
          detected_at?: string | null
          dm_sent_at?: string | null
          dm_status?: string | null
          email_message_id?: string | null
          id?: string
          last_followup_at?: string | null
          linkedin_url?: string | null
          name: string
          notes?: string | null
          source?: string | null
          status?: string
          title?: string | null
          user_id: string
        }
        Update: {
          campaign_profile_id?: string | null
          company?: string | null
          created_at?: string
          detected_at?: string | null
          dm_sent_at?: string | null
          dm_status?: string | null
          email_message_id?: string | null
          id?: string
          last_followup_at?: string | null
          linkedin_url?: string | null
          name?: string
          notes?: string | null
          source?: string | null
          status?: string
          title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "linkedin_events_campaign_profile_id_fkey"
            columns: ["campaign_profile_id"]
            isOneToOne: false
            referencedRelation: "campaign_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      monitored_posts: {
        Row: {
          approved_at: string | null
          author_degree: string | null
          author_headline: string | null
          author_name: string | null
          author_profile_url: string | null
          commented_at: string | null
          comments_count: number | null
          created_at: string
          final_comment: string | null
          fit_reason: string | null
          icp_fit: boolean | null
          icp_id: string | null
          id: string
          last_error: string | null
          post_text: string | null
          post_url: string | null
          post_urn: string
          posted_label: string | null
          priority: number
          reactions_count: number | null
          search_run_id: string | null
          signal_reason: string | null
          signal_type: string | null
          status: string
          suggested_comment: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          author_degree?: string | null
          author_headline?: string | null
          author_name?: string | null
          author_profile_url?: string | null
          commented_at?: string | null
          comments_count?: number | null
          created_at?: string
          final_comment?: string | null
          fit_reason?: string | null
          icp_fit?: boolean | null
          icp_id?: string | null
          id?: string
          last_error?: string | null
          post_text?: string | null
          post_url?: string | null
          post_urn: string
          posted_label?: string | null
          priority?: number
          reactions_count?: number | null
          search_run_id?: string | null
          signal_reason?: string | null
          signal_type?: string | null
          status?: string
          suggested_comment?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          author_degree?: string | null
          author_headline?: string | null
          author_name?: string | null
          author_profile_url?: string | null
          commented_at?: string | null
          comments_count?: number | null
          created_at?: string
          final_comment?: string | null
          fit_reason?: string | null
          icp_fit?: boolean | null
          icp_id?: string | null
          id?: string
          last_error?: string | null
          post_text?: string | null
          post_url?: string | null
          post_urn?: string
          posted_label?: string | null
          priority?: number
          reactions_count?: number | null
          search_run_id?: string | null
          signal_reason?: string | null
          signal_type?: string | null
          status?: string
          suggested_comment?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitored_posts_icp_id_fkey"
            columns: ["icp_id"]
            isOneToOne: false
            referencedRelation: "icps"
            referencedColumns: ["id"]
          },
        ]
      }
      network_prospects: {
        Row: {
          accepted_at: string | null
          created_at: string
          current_company: string | null
          degree: string | null
          fit_reason: string | null
          fit_score: number | null
          full_name: string | null
          headline: string | null
          icp_id: string | null
          id: string
          invited_at: string | null
          last_error: string | null
          linkedin_url: string
          location: string | null
          mutual_connections: number | null
          raw: Json | null
          search_run_id: string | null
          source: string
          status: string
          updated_at: string
          user_id: string
          withdrawn_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          current_company?: string | null
          degree?: string | null
          fit_reason?: string | null
          fit_score?: number | null
          full_name?: string | null
          headline?: string | null
          icp_id?: string | null
          id?: string
          invited_at?: string | null
          last_error?: string | null
          linkedin_url: string
          location?: string | null
          mutual_connections?: number | null
          raw?: Json | null
          search_run_id?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_id: string
          withdrawn_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          current_company?: string | null
          degree?: string | null
          fit_reason?: string | null
          fit_score?: number | null
          full_name?: string | null
          headline?: string | null
          icp_id?: string | null
          id?: string
          invited_at?: string | null
          last_error?: string | null
          linkedin_url?: string
          location?: string | null
          mutual_connections?: number | null
          raw?: Json | null
          search_run_id?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_id?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "network_prospects_icp_id_fkey"
            columns: ["icp_id"]
            isOneToOne: false
            referencedRelation: "icps"
            referencedColumns: ["id"]
          },
        ]
      }
      network_search_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          icp_id: string | null
          id: string
          kind: string
          new_count: number | null
          page: number
          query: Json | null
          results_count: number | null
          search_url: string | null
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          icp_id?: string | null
          id?: string
          kind: string
          new_count?: number | null
          page?: number
          query?: Json | null
          results_count?: number | null
          search_url?: string | null
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          icp_id?: string | null
          id?: string
          kind?: string
          new_count?: number | null
          page?: number
          query?: Json | null
          results_count?: number | null
          search_url?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "network_search_runs_icp_id_fkey"
            columns: ["icp_id"]
            isOneToOne: false
            referencedRelation: "icps"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_snapshots: {
        Row: {
          about: string | null
          captured_at: string | null
          created_at: string
          event_id: string | null
          experience: Json | null
          headline: string | null
          id: string
          linkedin_url: string | null
          raw_text: string | null
          source: string | null
          user_id: string
        }
        Insert: {
          about?: string | null
          captured_at?: string | null
          created_at?: string
          event_id?: string | null
          experience?: Json | null
          headline?: string | null
          id?: string
          linkedin_url?: string | null
          raw_text?: string | null
          source?: string | null
          user_id: string
        }
        Update: {
          about?: string | null
          captured_at?: string | null
          created_at?: string
          event_id?: string | null
          experience?: Json | null
          headline?: string | null
          id?: string
          linkedin_url?: string | null
          raw_text?: string | null
          source?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_snapshots_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "linkedin_events"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          apollo_api_key: string | null
          apollo_connected: boolean | null
          campaign_objective: string | null
          company_description: string | null
          company_name: string | null
          company_type: string | null
          created_at: string
          cta_goal: string | null
          dm_example: string | null
          dm_tone: string | null
          extension_token: string | null
          icp: string | null
          icp_description: string | null
          icp_titles: string[] | null
          id: string
          master_onboarding_completed: boolean | null
          offer_focus: string | null
          onboarding_completed: boolean | null
          pain_points: string[] | null
          proof_points: string | null
          sender_name: string | null
          sender_title: string | null
          tone: string | null
          updated_at: string
          user_id: string
          value_proposition: string | null
        }
        Insert: {
          apollo_api_key?: string | null
          apollo_connected?: boolean | null
          campaign_objective?: string | null
          company_description?: string | null
          company_name?: string | null
          company_type?: string | null
          created_at?: string
          cta_goal?: string | null
          dm_example?: string | null
          dm_tone?: string | null
          extension_token?: string | null
          icp?: string | null
          icp_description?: string | null
          icp_titles?: string[] | null
          id?: string
          master_onboarding_completed?: boolean | null
          offer_focus?: string | null
          onboarding_completed?: boolean | null
          pain_points?: string[] | null
          proof_points?: string | null
          sender_name?: string | null
          sender_title?: string | null
          tone?: string | null
          updated_at?: string
          user_id: string
          value_proposition?: string | null
        }
        Update: {
          apollo_api_key?: string | null
          apollo_connected?: boolean | null
          campaign_objective?: string | null
          company_description?: string | null
          company_name?: string | null
          company_type?: string | null
          created_at?: string
          cta_goal?: string | null
          dm_example?: string | null
          dm_tone?: string | null
          extension_token?: string | null
          icp?: string | null
          icp_description?: string | null
          icp_titles?: string[] | null
          id?: string
          master_onboarding_completed?: boolean | null
          offer_focus?: string | null
          onboarding_completed?: boolean | null
          pain_points?: string[] | null
          proof_points?: string | null
          sender_name?: string | null
          sender_title?: string | null
          tone?: string | null
          updated_at?: string
          user_id?: string
          value_proposition?: string | null
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          created_at: string
          cycle_reset_date: string | null
          cycle_start_date: string
          id: string
          leads_processed_this_cycle: number | null
          leads_used_this_cycle: number
          linkedin_accounts_limit: number
          max_campaigns: number
          max_leads_per_cycle: number
          plan: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          cycle_reset_date?: string | null
          cycle_start_date?: string
          id?: string
          leads_processed_this_cycle?: number | null
          leads_used_this_cycle?: number
          linkedin_accounts_limit?: number
          max_campaigns?: number
          max_leads_per_cycle?: number
          plan?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          cycle_reset_date?: string | null
          cycle_start_date?: string
          id?: string
          leads_processed_this_cycle?: number | null
          leads_used_this_cycle?: number
          linkedin_accounts_limit?: number
          max_campaigns?: number
          max_leads_per_cycle?: number
          plan?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      verticals: {
        Row: {
          created_at: string | null
          default_employee_range: string[] | null
          default_pain_points: string[] | null
          default_titles: string[]
          description: string | null
          expansion_titles: string[] | null
          fear_trigger: string | null
          icon: string | null
          id: string
          name: string
          primary_compliance: string | null
          scan_detectors: string[] | null
          sort_order: number | null
          suggested_industries: string[] | null
          suggested_keywords: string[] | null
          tier: number
          trap_explanations: Json | null
          trap_titles: string[] | null
        }
        Insert: {
          created_at?: string | null
          default_employee_range?: string[] | null
          default_pain_points?: string[] | null
          default_titles: string[]
          description?: string | null
          expansion_titles?: string[] | null
          fear_trigger?: string | null
          icon?: string | null
          id?: string
          name: string
          primary_compliance?: string | null
          scan_detectors?: string[] | null
          sort_order?: number | null
          suggested_industries?: string[] | null
          suggested_keywords?: string[] | null
          tier: number
          trap_explanations?: Json | null
          trap_titles?: string[] | null
        }
        Update: {
          created_at?: string | null
          default_employee_range?: string[] | null
          default_pain_points?: string[] | null
          default_titles?: string[]
          description?: string | null
          expansion_titles?: string[] | null
          fear_trigger?: string | null
          icon?: string | null
          id?: string
          name?: string
          primary_compliance?: string | null
          scan_detectors?: string[] | null
          sort_order?: number | null
          suggested_industries?: string[] | null
          suggested_keywords?: string[] | null
          tier?: number
          trap_explanations?: Json | null
          trap_titles?: string[] | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_leads_processed: {
        Args: { p_amount?: number; p_user_id: string }
        Returns: number
      }
      approve_post_comments: {
        Args: { p_edits?: Json; p_ids: string[] }
        Returns: number
      }
      bump_extension_counters: {
        Args: { p_action_type: string; p_user_id: string }
        Returns: undefined
      }
      consume_lead_credits: {
        Args: { p_amount?: number; p_user_id: string }
        Returns: boolean
      }
      gen_random_bytes: { Args: { size: number }; Returns: string }
      gen_random_uuid: { Args: never; Returns: string }
      network_stats: { Args: { p_days?: number }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
