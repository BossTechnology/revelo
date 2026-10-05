
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "allowed_emails": {
                  Row: {
                    "email": string,"invited_by": string | null
                  }
                  Insert: {
                    "email": string,"invited_by"?: string | null
                  }
                  Update: {
                    "email"?: string,"invited_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "allowed_emails_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"attachments": {
                  Row: {
                    "created_at": string,"filename": string,"id": string,"md5": string | null,"reply_id": string | null,"sha1": string | null,"size_bytes": number,"storage_path": string,"task_id": string,"uploaded_by": string,"via": string
                  }
                  Insert: {
                    "created_at"?: string,"filename": string,"id"?: string,"md5"?: string | null,"reply_id"?: string | null,"sha1"?: string | null,"size_bytes": number,"storage_path": string,"task_id": string,"uploaded_by": string,"via": string
                  }
                  Update: {
                    "created_at"?: string,"filename"?: string,"id"?: string,"md5"?: string | null,"reply_id"?: string | null,"sha1"?: string | null,"size_bytes"?: number,"storage_path"?: string,"task_id"?: string,"uploaded_by"?: string,"via"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "attachments_reply_id_fkey"
      columns: ["reply_id"]
isOneToOne: false
      referencedRelation: "replies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attachments_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attachments_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"git_events": {
                  Row: {
                    "delivery_id": string,"id": number,"kind": string,"occurred_at": string,"owner": string,"payload": NonNullable<Json>,"pr_number": number | null,"project_id": string | null,"ref": string | null,"repo": string,"sha": string | null,"state": string | null,"title": string | null,"url": string | null
                  }
                  Insert: {
                    "delivery_id": string,"id"?: never,"kind": string,"occurred_at": string,"owner": string,"payload": NonNullable<Json>,"pr_number"?: number | null,"project_id"?: string | null,"ref"?: string | null,"repo": string,"sha"?: string | null,"state"?: string | null,"title"?: string | null,"url"?: string | null
                  }
                  Update: {
                    "delivery_id"?: string,"id"?: never,"kind"?: string,"occurred_at"?: string,"owner"?: string,"payload"?: NonNullable<Json>,"pr_number"?: number | null,"project_id"?: string | null,"ref"?: string | null,"repo"?: string,"sha"?: string | null,"state"?: string | null,"title"?: string | null,"url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "git_events_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string,"id": string,"role": string,"turn_color": string
                  }
                  Insert: {
                    "created_at"?: string,"display_name": string,"id": string,"role": string,"turn_color"?: string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"id"?: string,"role"?: string,"turn_color"?: string
                  }
                  Relationships: [
                    
                  ]
                },"project_members": {
                  Row: {
                    "project_id": string,"user_id": string
                  }
                  Insert: {
                    "project_id": string,"user_id": string
                  }
                  Update: {
                    "project_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_members_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"project_repos": {
                  Row: {
                    "installation_id": number,"owner": string,"project_id": string | null,"repo": string
                  }
                  Insert: {
                    "installation_id": number,"owner": string,"project_id"?: string | null,"repo": string
                  }
                  Update: {
                    "installation_id"?: number,"owner"?: string,"project_id"?: string | null,"repo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_repos_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"projects": {
                  Row: {
                    "archived_at": string | null,"color": string,"created_at": string,"id": string,"key": string,"name": string,"next_number": number
                  }
                  Insert: {
                    "archived_at"?: string | null,"color": string,"created_at"?: string,"id"?: string,"key": string,"name": string,"next_number"?: number
                  }
                  Update: {
                    "archived_at"?: string | null,"color"?: string,"created_at"?: string,"id"?: string,"key"?: string,"name"?: string,"next_number"?: number
                  }
                  Relationships: [
                    
                  ]
                },"replies": {
                  Row: {
                    "author_id": string,"body": string,"created_at": string,"id": string,"mark": Database["public"]['Enums']["reply_mark"],"task_id": string,"via": string
                  }
                  Insert: {
                    "author_id": string,"body": string,"created_at"?: string,"id"?: string,"mark"?: Database["public"]['Enums']["reply_mark"],"task_id": string,"via": string
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"created_at"?: string,"id"?: string,"mark"?: Database["public"]['Enums']["reply_mark"],"task_id"?: string,"via"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "replies_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "replies_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"task_events": {
                  Row: {
                    "actor_id": string | null,"created_at": string,"from_value": string | null,"id": number,"kind": string,"task_id": string,"to_value": string | null,"via": string
                  }
                  Insert: {
                    "actor_id"?: string | null,"created_at"?: string,"from_value"?: string | null,"id"?: never,"kind": string,"task_id": string,"to_value"?: string | null,"via": string
                  }
                  Update: {
                    "actor_id"?: string | null,"created_at"?: string,"from_value"?: string | null,"id"?: never,"kind"?: string,"task_id"?: string,"to_value"?: string | null,"via"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_events_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"task_git_links": {
                  Row: {
                    "git_event_id": number,"matched_in": string,"task_id": string
                  }
                  Insert: {
                    "git_event_id": number,"matched_in": string,"task_id": string
                  }
                  Update: {
                    "git_event_id"?: number,"matched_in"?: string,"task_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_git_links_git_event_id_fkey"
      columns: ["git_event_id"]
isOneToOne: false
      referencedRelation: "git_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_git_links_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"tasks": {
                  Row: {
                    "aliases": (string)[],"body": string,"created_at": string,"created_by": string,"created_via": string,"due_date": string | null,"id": string,"key": string,"number": number,"project_id": string,"status": Database["public"]['Enums']["task_status"],"title": string,"turn": Database["public"]['Enums']["turn_kind"],"turn_third_party": string | null,"turn_user_id": string | null,"type": Database["public"]['Enums']["task_type"],"updated_at": string,"turn_label": string | null
                  }
                  Insert: {
                    "aliases"?: (string)[],"body"?: string,"created_at"?: string,"created_by": string,"created_via": string,"due_date"?: string | null,"id"?: string,"key": string,"number": number,"project_id": string,"status"?: Database["public"]['Enums']["task_status"],"title": string,"turn"?: Database["public"]['Enums']["turn_kind"],"turn_third_party"?: string | null,"turn_user_id"?: string | null,"type": Database["public"]['Enums']["task_type"],"updated_at"?: string
                  }
                  Update: {
                    "aliases"?: (string)[],"body"?: string,"created_at"?: string,"created_by"?: string,"created_via"?: string,"due_date"?: string | null,"id"?: string,"key"?: string,"number"?: number,"project_id"?: string,"status"?: Database["public"]['Enums']["task_status"],"title"?: string,"turn"?: Database["public"]['Enums']["turn_kind"],"turn_third_party"?: string | null,"turn_user_id"?: string | null,"type"?: Database["public"]['Enums']["task_type"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_turn_user_id_fkey"
      columns: ["turn_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "hook_before_user_created":
{ Args: { "event": Json }; Returns: Json
                           },
"is_allowed_email":
{ Args: { "email": string }; Returns: boolean
                           },
"is_member":
{ Args: { "project": string }; Returns: boolean
                           },
"request_via":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"storage_project":
{ Args: { "object_name": string }; Returns: string
                           },
"task_project":
{ Args: { "task": string }; Returns: string
                           },
"turn_label":
{ Args: { "t": Database["public"]['Tables']["tasks"]['Row'] }; Returns: string
                           }
          }
          Enums: {
            "reply_mark": "normal"|"oficial"|"firmada","task_status": "por_hacer"|"en_proceso"|"terminado","task_type": "handoff"|"pregunta"|"decision"|"externo","turn_kind": "persona"|"tercero"|"nadie"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "reply_mark": ["normal", "oficial", "firmada"],"task_status": ["por_hacer", "en_proceso", "terminado"],"task_type": ["handoff", "pregunta", "decision", "externo"],"turn_kind": ["persona", "tercero", "nadie"]
          }
        }
} as const
