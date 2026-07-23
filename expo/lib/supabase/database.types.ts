/**
 * Hand-maintained Database types for PunchThis Supabase schema.
 * Regenerate via `supabase gen types typescript` once CLI is linked.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type SyncStatusDb = "local_only" | "pending_upload" | "synced" | "conflict" | "error";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          display_name: string;
          company_name: string;
          logo_bucket: string | null;
          logo_path: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          local_version: number;
          server_version: number;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & { id: string };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
      };
      user_settings: {
        Row: {
          owner_id: string;
          inspector_name: string;
          company_name: string;
          logo_bucket: string | null;
          logo_path: string | null;
          report_footer_text: string;
          default_report_options: Json;
          upload_wifi_only: boolean;
          keep_awake_while_uploading: boolean;
          storage_notice_dismissed_at: string | null;
          last_time_to_first_issue_ms: number | null;
          last_audit_id: string | null;
          last_location_id: string | null;
          last_assignee_id: string | null;
          last_priority: string;
          demo_seeded: boolean;
          local_import_completed_at: string | null;
          local_import_checkpoint: Json;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          local_version: number;
          server_version: number;
        };
        Insert: Partial<Database["public"]["Tables"]["user_settings"]["Row"]> & { owner_id: string };
        Update: Partial<Database["public"]["Tables"]["user_settings"]["Row"]>;
      };
      sync_checkpoints: {
        Row: {
          owner_id: string;
          last_pulled_at: string | null;
          last_push_at: string | null;
          meta: Json;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["sync_checkpoints"]["Row"]> & { owner_id: string };
        Update: Partial<Database["public"]["Tables"]["sync_checkpoints"]["Row"]>;
      };
      projects: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          reference: string;
          client_name: string;
          site_address: string;
          company_name: string;
          inspector_name: string;
          cover_bucket: string | null;
          cover_path: string | null;
          logo_bucket: string | null;
          logo_path: string | null;
          status: string;
          last_report_theme_key: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          local_version: number;
          server_version: number;
          sync_status: SyncStatusDb;
        };
        Insert: Partial<Database["public"]["Tables"]["projects"]["Row"]> & {
          id: string;
          owner_id: string;
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["projects"]["Row"]>;
      };
      project_locations: {
        Row: {
          id: string;
          owner_id: string;
          project_id: string;
          name: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          local_version: number;
          server_version: number;
          sync_status: SyncStatusDb;
        };
        Insert: Partial<Database["public"]["Tables"]["project_locations"]["Row"]> & {
          id: string;
          owner_id: string;
          project_id: string;
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["project_locations"]["Row"]>;
      };
      assignees: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          company: string;
          email: string;
          phone: string;
          trade: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          local_version: number;
          server_version: number;
          sync_status: SyncStatusDb;
        };
        Insert: Partial<Database["public"]["Tables"]["assignees"]["Row"]> & {
          id: string;
          owner_id: string;
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["assignees"]["Row"]>;
      };
      audits: {
        Row: {
          id: string;
          owner_id: string;
          project_id: string;
          title: string;
          audit_date: string;
          prepared_for: string;
          prepared_by: string;
          status: string;
          notes: string;
          default_location_id: string | null;
          default_assignee_id: string | null;
          theme_key: string;
          completed_at: string | null;
          report_issued_at: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          local_version: number;
          server_version: number;
          sync_status: SyncStatusDb;
        };
        Insert: Partial<Database["public"]["Tables"]["audits"]["Row"]> & {
          id: string;
          owner_id: string;
          project_id: string;
          title: string;
          audit_date: string;
        };
        Update: Partial<Database["public"]["Tables"]["audits"]["Row"]>;
      };
      issues: {
        Row: {
          id: string;
          owner_id: string;
          audit_id: string;
          project_id: string;
          location_id: string | null;
          issue_number: number;
          title: string;
          description: string;
          status: string;
          priority: string;
          assignee_id: string | null;
          include_in_report: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          local_version: number;
          server_version: number;
          sync_status: SyncStatusDb;
        };
        Insert: Partial<Database["public"]["Tables"]["issues"]["Row"]> & {
          id: string;
          owner_id: string;
          audit_id: string;
          project_id: string;
          issue_number: number;
        };
        Update: Partial<Database["public"]["Tables"]["issues"]["Row"]>;
      };
      photo_assets: {
        Row: {
          id: string;
          owner_id: string;
          issue_id: string;
          audit_id: string;
          project_id: string;
          original_bucket: string | null;
          original_path: string | null;
          report_bucket: string | null;
          report_path: string | null;
          thumb_bucket: string | null;
          thumb_path: string | null;
          annotated_bucket: string | null;
          annotated_path: string | null;
          width: number;
          height: number;
          captured_at: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          local_version: number;
          server_version: number;
          sync_status: SyncStatusDb;
        };
        Insert: Partial<Database["public"]["Tables"]["photo_assets"]["Row"]> & {
          id: string;
          owner_id: string;
          issue_id: string;
          audit_id: string;
          project_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["photo_assets"]["Row"]>;
      };
      annotation_records: {
        Row: {
          id: string;
          owner_id: string;
          asset_id: string;
          issue_id: string;
          elements: Json;
          toolset_version: number;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          local_version: number;
          server_version: number;
          sync_status: SyncStatusDb;
        };
        Insert: Partial<Database["public"]["Tables"]["annotation_records"]["Row"]> & {
          id: string;
          owner_id: string;
          asset_id: string;
          issue_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["annotation_records"]["Row"]>;
      };
      report_exports: {
        Row: {
          id: string;
          owner_id: string;
          audit_id: string;
          project_id: string;
          pdf_bucket: string | null;
          pdf_path: string | null;
          issue_count: number;
          photo_count: number;
          options: Json;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          local_version: number;
          server_version: number;
          sync_status: SyncStatusDb;
        };
        Insert: Partial<Database["public"]["Tables"]["report_exports"]["Row"]> & {
          id: string;
          owner_id: string;
          audit_id: string;
          project_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["report_exports"]["Row"]>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
