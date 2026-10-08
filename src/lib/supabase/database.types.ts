
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "analytics_refresh": {
                  Row: {
                    "dirty": boolean,"id": boolean,"refreshed_at": string | null
                  }
                  Insert: {
                    "dirty"?: boolean,"id"?: boolean,"refreshed_at"?: string | null
                  }
                  Update: {
                    "dirty"?: boolean,"id"?: boolean,"refreshed_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"app_config": {
                  Row: {
                    "key": string,"value": string
                  }
                  Insert: {
                    "key": string,"value": string
                  }
                  Update: {
                    "key"?: string,"value"?: string
                  }
                  Relationships: [
                    
                  ]
                },"appointment_services": {
                  Row: {
                    "appointment_id": string,"service_id": string
                  }
                  Insert: {
                    "appointment_id": string,"service_id": string
                  }
                  Update: {
                    "appointment_id"?: string,"service_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "appointment_services_appointment_id_fkey"
      columns: ["appointment_id"]
isOneToOne: false
      referencedRelation: "appointments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appointment_services_appointment_id_fkey"
      columns: ["appointment_id"]
isOneToOne: false
      referencedRelation: "staff_my_appointments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appointment_services_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "public_services"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appointment_services_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "retail_stock"
      referencedColumns: ["service_id"]
    },{
      foreignKeyName: "appointment_services_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "service_margins"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appointment_services_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    }
                  ]
                },"appointments": {
                  Row: {
                    "arrived_at": string | null,"booking_group_id": string | null,"cancel_reason": string | null,"change_request": string | null,"change_requested_at": string | null,"created_at": string,"created_by": string | null,"customer_id": string | null,"duration_min": number,"end_at": string,"id": string,"notes": string,"resource_id": string,"service_ended_at": string | null,"service_started_at": string | null,"source": Database["public"]['Enums']["appt_source"],"staff_id": string | null,"start_at": string,"status": Database["public"]['Enums']["appt_status"],"status_changed_at": string | null,"status_changed_by": string | null
                  }
                  Insert: {
                    "arrived_at"?: string | null,"booking_group_id"?: string | null,"cancel_reason"?: string | null,"change_request"?: string | null,"change_requested_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string | null,"duration_min": number,"end_at": string,"id"?: string,"notes"?: string,"resource_id": string,"service_ended_at"?: string | null,"service_started_at"?: string | null,"source"?: Database["public"]['Enums']["appt_source"],"staff_id"?: string | null,"start_at": string,"status"?: Database["public"]['Enums']["appt_status"],"status_changed_at"?: string | null,"status_changed_by"?: string | null
                  }
                  Update: {
                    "arrived_at"?: string | null,"booking_group_id"?: string | null,"cancel_reason"?: string | null,"change_request"?: string | null,"change_requested_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string | null,"duration_min"?: number,"end_at"?: string,"id"?: string,"notes"?: string,"resource_id"?: string,"service_ended_at"?: string | null,"service_started_at"?: string | null,"source"?: Database["public"]['Enums']["appt_source"],"staff_id"?: string | null,"start_at"?: string,"status"?: Database["public"]['Enums']["appt_status"],"status_changed_at"?: string | null,"status_changed_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "appointments_booking_group_id_fkey"
      columns: ["booking_group_id"]
isOneToOne: false
      referencedRelation: "booking_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appointments_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customer_stats"
      referencedColumns: ["customer_id"]
    },{
      foreignKeyName: "appointments_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appointments_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "my_customer"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appointments_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "staff_customer_card"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appointments_resource_id_fkey"
      columns: ["resource_id"]
isOneToOne: false
      referencedRelation: "resources"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appointments_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "public_staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appointments_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor": string | null,"at": string,"changes": NonNullable<Json>,"entity": string,"entity_id": string | null,"id": number
                  }
                  Insert: {
                    "action": string,"actor"?: string | null,"at"?: string,"changes"?: NonNullable<Json>,"entity": string,"entity_id"?: string | null,"id"?: never
                  }
                  Update: {
                    "action"?: string,"actor"?: string | null,"at"?: string,"changes"?: NonNullable<Json>,"entity"?: string,"entity_id"?: string | null,"id"?: never
                  }
                  Relationships: [
                    
                  ]
                },"booking_attempts": {
                  Row: {
                    "created_at": string,"id": number,"key": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: never,"key": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: never,"key"?: string
                  }
                  Relationships: [
                    
                  ]
                },"booking_groups": {
                  Row: {
                    "client_request_id": string | null,"code": string,"created_at": string,"created_by": string | null,"customer_id": string | null,"id": string,"rescheduled_from": string | null,"source": Database["public"]['Enums']["appt_source"]
                  }
                  Insert: {
                    "client_request_id"?: string | null,"code": string,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string | null,"id"?: string,"rescheduled_from"?: string | null,"source"?: Database["public"]['Enums']["appt_source"]
                  }
                  Update: {
                    "client_request_id"?: string | null,"code"?: string,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string | null,"id"?: string,"rescheduled_from"?: string | null,"source"?: Database["public"]['Enums']["appt_source"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "booking_groups_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customer_stats"
      referencedColumns: ["customer_id"]
    },{
      foreignKeyName: "booking_groups_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "booking_groups_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "my_customer"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "booking_groups_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "staff_customer_card"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "booking_groups_rescheduled_from_fkey"
      columns: ["rescheduled_from"]
isOneToOne: false
      referencedRelation: "booking_groups"
      referencedColumns: ["id"]
    }
                  ]
                },"cash_closings": {
                  Row: {
                    "cashier_id": string | null,"created_at": string,"date": string,"difference": number | null,"expected_cash": number,"id": string,"note": string,"physical_cash": number,"summary": NonNullable<Json>
                  }
                  Insert: {
                    "cashier_id"?: string | null,"created_at"?: string,"date": string,"difference"?: never,"expected_cash": number,"id"?: string,"note"?: string,"physical_cash": number,"summary": NonNullable<Json>
                  }
                  Update: {
                    "cashier_id"?: string | null,"created_at"?: string,"date"?: string,"difference"?: never,"expected_cash"?: number,"id"?: string,"note"?: string,"physical_cash"?: number,"summary"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "cash_closings_cashier_id_fkey"
      columns: ["cashier_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cash_closings_cashier_id_fkey"
      columns: ["cashier_id"]
isOneToOne: false
      referencedRelation: "team_names"
      referencedColumns: ["id"]
    }
                  ]
                },"cost_changes": {
                  Row: {
                    "after": number,"before": number,"changed_by": string | null,"created_at": string,"id": string,"item_id": string,"reason": string
                  }
                  Insert: {
                    "after": number,"before": number,"changed_by"?: string | null,"created_at"?: string,"id"?: string,"item_id": string,"reason": string
                  }
                  Update: {
                    "after"?: number,"before"?: number,"changed_by"?: string | null,"created_at"?: string,"id"?: string,"item_id"?: string,"reason"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cost_changes_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "inventory_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cost_changes_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "inventory_public"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cost_changes_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "stock_levels"
      referencedColumns: ["item_id"]
    }
                  ]
                },"customers": {
                  Row: {
                    "created_at": string,"created_by": string | null,"email": string | null,"id": string,"name": string,"notes": string,"whatsapp": string | null
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"email"?: string | null,"id"?: string,"name": string,"notes"?: string,"whatsapp"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"email"?: string | null,"id"?: string,"name"?: string,"notes"?: string,"whatsapp"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"deposit_packages": {
                  Row: {
                    "active": boolean,"amount_credited": number,"amount_paid": number,"created_at": string,"id": string,"name": string
                  }
                  Insert: {
                    "active"?: boolean,"amount_credited": number,"amount_paid": number,"created_at"?: string,"id"?: string,"name": string
                  }
                  Update: {
                    "active"?: boolean,"amount_credited"?: number,"amount_paid"?: number,"created_at"?: string,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"deposit_topups": {
                  Row: {
                    "amount_credited": number,"amount_paid": number,"created_at": string,"created_by": string | null,"customer_id": string,"id": string,"method": Database["public"]['Enums']["pay_method"],"package_id": string | null,"qris_ref": string | null
                  }
                  Insert: {
                    "amount_credited": number,"amount_paid": number,"created_at"?: string,"created_by"?: string | null,"customer_id": string,"id"?: string,"method": Database["public"]['Enums']["pay_method"],"package_id"?: string | null,"qris_ref"?: string | null
                  }
                  Update: {
                    "amount_credited"?: number,"amount_paid"?: number,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string,"id"?: string,"method"?: Database["public"]['Enums']["pay_method"],"package_id"?: string | null,"qris_ref"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "deposit_topups_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customer_stats"
      referencedColumns: ["customer_id"]
    },{
      foreignKeyName: "deposit_topups_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deposit_topups_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "my_customer"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deposit_topups_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "staff_customer_card"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deposit_topups_package_id_fkey"
      columns: ["package_id"]
isOneToOne: false
      referencedRelation: "deposit_packages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deposit_topups_package_id_fkey"
      columns: ["package_id"]
isOneToOne: false
      referencedRelation: "public_deposit_packages"
      referencedColumns: ["id"]
    }
                  ]
                },"followup_events": {
                  Row: {
                    "channel": string,"created_at": string,"customer_id": string,"id": string,"sent_by": string | null
                  }
                  Insert: {
                    "channel"?: string,"created_at"?: string,"customer_id": string,"id"?: string,"sent_by"?: string | null
                  }
                  Update: {
                    "channel"?: string,"created_at"?: string,"customer_id"?: string,"id"?: string,"sent_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "followup_events_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customer_stats"
      referencedColumns: ["customer_id"]
    },{
      foreignKeyName: "followup_events_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "followup_events_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "my_customer"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "followup_events_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "staff_customer_card"
      referencedColumns: ["id"]
    }
                  ]
                },"funnel_events": {
                  Row: {
                    "created_at": string,"id": number,"session_id": string,"step": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: never,"session_id": string,"step": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: never,"session_id"?: string,"step"?: string
                  }
                  Relationships: [
                    
                  ]
                },"hair_consults": {
                  Row: {
                    "actor": string,"appointment_id": string | null,"created_at": string,"customer_id": string | null,"id": string,"previews_used": number,"result": NonNullable<Json>,"status": string
                  }
                  Insert: {
                    "actor": string,"appointment_id"?: string | null,"created_at"?: string,"customer_id"?: string | null,"id"?: string,"previews_used"?: number,"result"?: NonNullable<Json>,"status": string
                  }
                  Update: {
                    "actor"?: string,"appointment_id"?: string | null,"created_at"?: string,"customer_id"?: string | null,"id"?: string,"previews_used"?: number,"result"?: NonNullable<Json>,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "hair_consults_actor_fkey"
      columns: ["actor"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "hair_consults_actor_fkey"
      columns: ["actor"]
isOneToOne: false
      referencedRelation: "team_names"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "hair_consults_appointment_id_fkey"
      columns: ["appointment_id"]
isOneToOne: false
      referencedRelation: "appointments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "hair_consults_appointment_id_fkey"
      columns: ["appointment_id"]
isOneToOne: false
      referencedRelation: "staff_my_appointments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "hair_consults_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customer_stats"
      referencedColumns: ["customer_id"]
    },{
      foreignKeyName: "hair_consults_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "hair_consults_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "my_customer"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "hair_consults_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "staff_customer_card"
      referencedColumns: ["id"]
    }
                  ]
                },"hair_cut_records": {
                  Row: {
                    "appointment_id": string | null,"consult_id": string | null,"created_at": string,"created_by": string | null,"customer_id": string,"hairstyle_id": string | null,"id": string,"notes": string,"preview_expires_at": string | null,"preview_path": string | null,"reaction": string,"staff_id": string | null,"style_name": string
                  }
                  Insert: {
                    "appointment_id"?: string | null,"consult_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"customer_id": string,"hairstyle_id"?: string | null,"id"?: string,"notes"?: string,"preview_expires_at"?: string | null,"preview_path"?: string | null,"reaction"?: string,"staff_id"?: string | null,"style_name": string
                  }
                  Update: {
                    "appointment_id"?: string | null,"consult_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string,"hairstyle_id"?: string | null,"id"?: string,"notes"?: string,"preview_expires_at"?: string | null,"preview_path"?: string | null,"reaction"?: string,"staff_id"?: string | null,"style_name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "hair_cut_records_appointment_id_fkey"
      columns: ["appointment_id"]
isOneToOne: false
      referencedRelation: "appointments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "hair_cut_records_appointment_id_fkey"
      columns: ["appointment_id"]
isOneToOne: false
      referencedRelation: "staff_my_appointments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "hair_cut_records_consult_id_fkey"
      columns: ["consult_id"]
isOneToOne: false
      referencedRelation: "hair_consults"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "hair_cut_records_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "hair_cut_records_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "team_names"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "hair_cut_records_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customer_stats"
      referencedColumns: ["customer_id"]
    },{
      foreignKeyName: "hair_cut_records_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "hair_cut_records_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "my_customer"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "hair_cut_records_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "staff_customer_card"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "hair_cut_records_hairstyle_id_fkey"
      columns: ["hairstyle_id"]
isOneToOne: false
      referencedRelation: "hairstyles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "hair_cut_records_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "public_staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "hair_cut_records_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    }
                  ]
                },"hairstyle_images": {
                  Row: {
                    "created_at": string,"hairstyle_id": string,"id": string,"path": string,"sort": number,"view": string
                  }
                  Insert: {
                    "created_at"?: string,"hairstyle_id": string,"id"?: string,"path": string,"sort"?: number,"view"?: string
                  }
                  Update: {
                    "created_at"?: string,"hairstyle_id"?: string,"id"?: string,"path"?: string,"sort"?: number,"view"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "hairstyle_images_hairstyle_id_fkey"
      columns: ["hairstyle_id"]
isOneToOne: false
      referencedRelation: "hairstyles"
      referencedColumns: ["id"]
    }
                  ]
                },"hairstyles": {
                  Row: {
                    "active": boolean,"category": string,"code": string,"created_at": string,"cut_notes": string,"description": string,"face_shapes": (string)[],"hair_density": (string)[],"hair_types": (string)[],"highlights": (string)[],"id": string,"maintenance_level": string,"name": string,"sort": number,"style_character": (string)[],"suitable_lengths": (string)[]
                  }
                  Insert: {
                    "active"?: boolean,"category"?: string,"code": string,"created_at"?: string,"cut_notes"?: string,"description"?: string,"face_shapes"?: (string)[],"hair_density"?: (string)[],"hair_types"?: (string)[],"highlights"?: (string)[],"id"?: string,"maintenance_level"?: string,"name": string,"sort"?: number,"style_character"?: (string)[],"suitable_lengths"?: (string)[]
                  }
                  Update: {
                    "active"?: boolean,"category"?: string,"code"?: string,"created_at"?: string,"cut_notes"?: string,"description"?: string,"face_shapes"?: (string)[],"hair_density"?: (string)[],"hair_types"?: (string)[],"highlights"?: (string)[],"id"?: string,"maintenance_level"?: string,"name"?: string,"sort"?: number,"style_character"?: (string)[],"suitable_lengths"?: (string)[]
                  }
                  Relationships: [
                    
                  ]
                },"inventory_items": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"kind": Database["public"]['Enums']["item_kind"],"min_order_qty": number | null,"name": string,"reorder_at": number,"sku": string | null,"supplier_id": string | null,"unit": string,"unit_cost": number
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"kind": Database["public"]['Enums']["item_kind"],"min_order_qty"?: number | null,"name": string,"reorder_at"?: number,"sku"?: string | null,"supplier_id"?: string | null,"unit"?: string,"unit_cost"?: number
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["item_kind"],"min_order_qty"?: number | null,"name"?: string,"reorder_at"?: number,"sku"?: string | null,"supplier_id"?: string | null,"unit"?: string,"unit_cost"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_items_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"maintenance_logs": {
                  Row: {
                    "cost": number | null,"created_at": string,"done_by": string | null,"id": string,"note": string,"photo_path": string | null,"task_id": string,"vendor": string | null
                  }
                  Insert: {
                    "cost"?: number | null,"created_at"?: string,"done_by"?: string | null,"id"?: string,"note"?: string,"photo_path"?: string | null,"task_id": string,"vendor"?: string | null
                  }
                  Update: {
                    "cost"?: number | null,"created_at"?: string,"done_by"?: string | null,"id"?: string,"note"?: string,"photo_path"?: string | null,"task_id"?: string,"vendor"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "maintenance_logs_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "maintenance_tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"maintenance_tasks": {
                  Row: {
                    "active": boolean,"assignee_staff_id": string | null,"created_at": string,"id": string,"interval_days": number,"name": string,"procedure": string
                  }
                  Insert: {
                    "active"?: boolean,"assignee_staff_id"?: string | null,"created_at"?: string,"id"?: string,"interval_days"?: number,"name": string,"procedure"?: string
                  }
                  Update: {
                    "active"?: boolean,"assignee_staff_id"?: string | null,"created_at"?: string,"id"?: string,"interval_days"?: number,"name"?: string,"procedure"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "maintenance_tasks_assignee_staff_id_fkey"
      columns: ["assignee_staff_id"]
isOneToOne: false
      referencedRelation: "public_staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "maintenance_tasks_assignee_staff_id_fkey"
      columns: ["assignee_staff_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "created_at": string,"id": string,"kind": string,"payload": NonNullable<Json>,"read_at": string | null,"target_role": Database["public"]['Enums']["app_role"],"target_user": string | null
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"kind": string,"payload"?: NonNullable<Json>,"read_at"?: string | null,"target_role": Database["public"]['Enums']["app_role"],"target_user"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"kind"?: string,"payload"?: NonNullable<Json>,"read_at"?: string | null,"target_role"?: Database["public"]['Enums']["app_role"],"target_user"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"opening_hours": {
                  Row: {
                    "close_time": string,"closed": boolean,"open_time": string,"weekday": number
                  }
                  Insert: {
                    "close_time"?: string,"closed"?: boolean,"open_time"?: string,"weekday": number
                  }
                  Update: {
                    "close_time"?: string,"closed"?: boolean,"open_time"?: string,"weekday"?: number
                  }
                  Relationships: [
                    
                  ]
                },"outbound_messages": {
                  Row: {
                    "attempts": number,"booking_group_id": string | null,"channel": string,"created_at": string,"id": string,"last_error": string | null,"send_after": string,"sent_at": string | null,"status": string,"template": string,"to_address": string
                  }
                  Insert: {
                    "attempts"?: number,"booking_group_id"?: string | null,"channel": string,"created_at"?: string,"id"?: string,"last_error"?: string | null,"send_after"?: string,"sent_at"?: string | null,"status"?: string,"template": string,"to_address": string
                  }
                  Update: {
                    "attempts"?: number,"booking_group_id"?: string | null,"channel"?: string,"created_at"?: string,"id"?: string,"last_error"?: string | null,"send_after"?: string,"sent_at"?: string | null,"status"?: string,"template"?: string,"to_address"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "outbound_messages_booking_group_id_fkey"
      columns: ["booking_group_id"]
isOneToOne: false
      referencedRelation: "booking_groups"
      referencedColumns: ["id"]
    }
                  ]
                },"payroll_adjustments": {
                  Row: {
                    "amount": number,"created_at": string,"created_by": string | null,"id": string,"kind": string,"month": string,"reason": string,"staff_id": string
                  }
                  Insert: {
                    "amount": number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"kind": string,"month": string,"reason": string,"staff_id": string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"kind"?: string,"month"?: string,"reason"?: string,"staff_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payroll_adjustments_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "public_staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payroll_adjustments_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    }
                  ]
                },"payroll_periods": {
                  Row: {
                    "closed_at": string | null,"closed_by": string | null,"id": string,"month": string,"reopen_reason": string | null,"reopened_at": string | null,"reopened_by": string | null,"status": string
                  }
                  Insert: {
                    "closed_at"?: string | null,"closed_by"?: string | null,"id"?: string,"month": string,"reopen_reason"?: string | null,"reopened_at"?: string | null,"reopened_by"?: string | null,"status"?: string
                  }
                  Update: {
                    "closed_at"?: string | null,"closed_by"?: string | null,"id"?: string,"month"?: string,"reopen_reason"?: string | null,"reopened_at"?: string | null,"reopened_by"?: string | null,"status"?: string
                  }
                  Relationships: [
                    
                  ]
                },"payroll_snapshots": {
                  Row: {
                    "adjustments": number,"category": Database["public"]['Enums']["staff_category"],"commission_pct": number,"commission_retail": number,"commission_service": number,"hpp_total": number,"note": string,"paid_at": string | null,"paid_by": string | null,"paid_method": string | null,"period_id": string,"revenue_net": number,"service_count": number,"staff_id": string,"staff_name": string,"subsidy": number,"total_pay": number
                  }
                  Insert: {
                    "adjustments": number,"category": Database["public"]['Enums']["staff_category"],"commission_pct": number,"commission_retail": number,"commission_service": number,"hpp_total": number,"note"?: string,"paid_at"?: string | null,"paid_by"?: string | null,"paid_method"?: string | null,"period_id": string,"revenue_net": number,"service_count": number,"staff_id": string,"staff_name": string,"subsidy": number,"total_pay": number
                  }
                  Update: {
                    "adjustments"?: number,"category"?: Database["public"]['Enums']["staff_category"],"commission_pct"?: number,"commission_retail"?: number,"commission_service"?: number,"hpp_total"?: number,"note"?: string,"paid_at"?: string | null,"paid_by"?: string | null,"paid_method"?: string | null,"period_id"?: string,"revenue_net"?: number,"service_count"?: number,"staff_id"?: string,"staff_name"?: string,"subsidy"?: number,"total_pay"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "payroll_snapshots_period_id_fkey"
      columns: ["period_id"]
isOneToOne: false
      referencedRelation: "payroll_periods"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payroll_snapshots_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "public_staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payroll_snapshots_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "active": boolean,"created_at": string,"customer_id": string | null,"email": string | null,"full_name": string,"id": string,"mfa_enabled": boolean,"phone": string | null,"role": Database["public"]['Enums']["app_role"],"staff_id": string | null
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"customer_id"?: string | null,"email"?: string | null,"full_name"?: string,"id": string,"mfa_enabled"?: boolean,"phone"?: string | null,"role"?: Database["public"]['Enums']["app_role"],"staff_id"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"customer_id"?: string | null,"email"?: string | null,"full_name"?: string,"id"?: string,"mfa_enabled"?: boolean,"phone"?: string | null,"role"?: Database["public"]['Enums']["app_role"],"staff_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: true
      referencedRelation: "customer_stats"
      referencedColumns: ["customer_id"]
    },{
      foreignKeyName: "profiles_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: true
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profiles_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: true
      referencedRelation: "my_customer"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profiles_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: true
      referencedRelation: "staff_customer_card"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profiles_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: true
      referencedRelation: "public_staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profiles_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: true
      referencedRelation: "staff"
      referencedColumns: ["id"]
    }
                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"endpoint": string,"id": string,"p256dh": string,"profile_id": string
                  }
                  Insert: {
                    "auth": string,"created_at"?: string,"endpoint": string,"id"?: string,"p256dh": string,"profile_id"?: string
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"endpoint"?: string,"id"?: string,"p256dh"?: string,"profile_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_subscriptions_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "push_subscriptions_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "team_names"
      referencedColumns: ["id"]
    }
                  ]
                },"recipe_changes": {
                  Row: {
                    "after": NonNullable<Json>,"before": NonNullable<Json>,"changed_by": string | null,"created_at": string,"id": string,"service_id": string
                  }
                  Insert: {
                    "after": NonNullable<Json>,"before": NonNullable<Json>,"changed_by"?: string | null,"created_at"?: string,"id"?: string,"service_id": string
                  }
                  Update: {
                    "after"?: NonNullable<Json>,"before"?: NonNullable<Json>,"changed_by"?: string | null,"created_at"?: string,"id"?: string,"service_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_changes_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "public_services"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_changes_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "retail_stock"
      referencedColumns: ["service_id"]
    },{
      foreignKeyName: "recipe_changes_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "service_margins"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_changes_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    }
                  ]
                },"resources": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"is_pedicure": boolean,"name": string,"sort": number,"type": Database["public"]['Enums']["staff_category"]
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"is_pedicure"?: boolean,"name": string,"sort"?: number,"type": Database["public"]['Enums']["staff_category"]
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"is_pedicure"?: boolean,"name"?: string,"sort"?: number,"type"?: Database["public"]['Enums']["staff_category"]
                  }
                  Relationships: [
                    
                  ]
                },"reviews": {
                  Row: {
                    "active": boolean,"author": string,"body": string,"created_at": string,"id": string,"sort": number,"source": string
                  }
                  Insert: {
                    "active"?: boolean,"author": string,"body": string,"created_at"?: string,"id"?: string,"sort"?: number,"source"?: string
                  }
                  Update: {
                    "active"?: boolean,"author"?: string,"body"?: string,"created_at"?: string,"id"?: string,"sort"?: number,"source"?: string
                  }
                  Relationships: [
                    
                  ]
                },"service_materials": {
                  Row: {
                    "id": string,"item_id": string,"qty": number,"service_id": string
                  }
                  Insert: {
                    "id"?: string,"item_id": string,"qty": number,"service_id": string
                  }
                  Update: {
                    "id"?: string,"item_id"?: string,"qty"?: number,"service_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "service_materials_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "inventory_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "service_materials_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "inventory_public"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "service_materials_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "stock_levels"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "service_materials_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "public_services"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "service_materials_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "retail_stock"
      referencedColumns: ["service_id"]
    },{
      foreignKeyName: "service_materials_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "service_margins"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "service_materials_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    }
                  ]
                },"services": {
                  Row: {
                    "active": boolean,"category": Database["public"]['Enums']["service_category"],"created_at": string,"duration_min": number,"id": string,"name": string,"needs_pedicure": boolean,"online_bookable": boolean,"price": number,"public_description": string,"sort": number,"stock_item_id": string | null,"upsell_service_id": string | null
                  }
                  Insert: {
                    "active"?: boolean,"category": Database["public"]['Enums']["service_category"],"created_at"?: string,"duration_min"?: number,"id"?: string,"name": string,"needs_pedicure"?: boolean,"online_bookable"?: boolean,"price": number,"public_description"?: string,"sort"?: number,"stock_item_id"?: string | null,"upsell_service_id"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"category"?: Database["public"]['Enums']["service_category"],"created_at"?: string,"duration_min"?: number,"id"?: string,"name"?: string,"needs_pedicure"?: boolean,"online_bookable"?: boolean,"price"?: number,"public_description"?: string,"sort"?: number,"stock_item_id"?: string | null,"upsell_service_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "services_stock_item_id_fkey"
      columns: ["stock_item_id"]
isOneToOne: false
      referencedRelation: "inventory_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "services_stock_item_id_fkey"
      columns: ["stock_item_id"]
isOneToOne: false
      referencedRelation: "inventory_public"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "services_stock_item_id_fkey"
      columns: ["stock_item_id"]
isOneToOne: false
      referencedRelation: "stock_levels"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "services_upsell_service_id_fkey"
      columns: ["upsell_service_id"]
isOneToOne: false
      referencedRelation: "public_services"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "services_upsell_service_id_fkey"
      columns: ["upsell_service_id"]
isOneToOne: false
      referencedRelation: "retail_stock"
      referencedColumns: ["service_id"]
    },{
      foreignKeyName: "services_upsell_service_id_fkey"
      columns: ["upsell_service_id"]
isOneToOne: false
      referencedRelation: "service_margins"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "services_upsell_service_id_fkey"
      columns: ["upsell_service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    }
                  ]
                },"settings": {
                  Row: {
                    "aov_target_barbershop": number,"aov_target_nail": number,"bloom_text": string,"booking_buffer_minutes": number,"booking_lead_minutes": number,"booking_max_days_ahead": number,"bundle_pct": number,"cancel_cutoff_hours": number,"churn_weeks": number,"close_time": string,"commission_pct": number,"followup_window_days": number,"founded_year": number | null,"groom_text": string,"hero_text": string,"hero_title": string,"hero_title_accent": string,"id": boolean,"insight_aov_gap_pct": number,"insight_low_util_pct": number,"inventory_cost_method": string,"invite_code": string,"kpi_min_tx_for_stable": number,"maint_default_interval_days": number,"maps_embed_url": string,"margin_warning_pct": number,"min_monthly_pay": number,"online_booking_mode": string,"online_booking_open": boolean,"open_time": string,"privacy_policy": string,"reorder_suggest_multiplier": number,"retail_commission_pct": number,"retail_ratio_max": number,"retail_ratio_min": number,"return_window_days": number,"revenue_target_monthly": number,"shop_address": string,"shop_instagram": string,"shop_name": string,"shop_whatsapp": string,"show_prices": boolean,"show_staff": boolean,"sop_reminder_time": string,"sop_require_photo_autoclave": boolean,"sop_shift_names": (string)[],"sop_shifts": number,"standards": NonNullable<Json>,"tagline": string,"updated_at": string,"usage_variance_threshold_pct": number,"utilization_target": number,"wa_followup_template": string
                  }
                  Insert: {
                    "aov_target_barbershop"?: number,"aov_target_nail"?: number,"bloom_text"?: string,"booking_buffer_minutes"?: number,"booking_lead_minutes"?: number,"booking_max_days_ahead"?: number,"bundle_pct"?: number,"cancel_cutoff_hours"?: number,"churn_weeks"?: number,"close_time"?: string,"commission_pct"?: number,"followup_window_days"?: number,"founded_year"?: number | null,"groom_text"?: string,"hero_text"?: string,"hero_title"?: string,"hero_title_accent"?: string,"id"?: boolean,"insight_aov_gap_pct"?: number,"insight_low_util_pct"?: number,"inventory_cost_method"?: string,"invite_code"?: string,"kpi_min_tx_for_stable"?: number,"maint_default_interval_days"?: number,"maps_embed_url"?: string,"margin_warning_pct"?: number,"min_monthly_pay"?: number,"online_booking_mode"?: string,"online_booking_open"?: boolean,"open_time"?: string,"privacy_policy"?: string,"reorder_suggest_multiplier"?: number,"retail_commission_pct"?: number,"retail_ratio_max"?: number,"retail_ratio_min"?: number,"return_window_days"?: number,"revenue_target_monthly"?: number,"shop_address"?: string,"shop_instagram"?: string,"shop_name"?: string,"shop_whatsapp"?: string,"show_prices"?: boolean,"show_staff"?: boolean,"sop_reminder_time"?: string,"sop_require_photo_autoclave"?: boolean,"sop_shift_names"?: (string)[],"sop_shifts"?: number,"standards"?: NonNullable<Json>,"tagline"?: string,"updated_at"?: string,"usage_variance_threshold_pct"?: number,"utilization_target"?: number,"wa_followup_template"?: string
                  }
                  Update: {
                    "aov_target_barbershop"?: number,"aov_target_nail"?: number,"bloom_text"?: string,"booking_buffer_minutes"?: number,"booking_lead_minutes"?: number,"booking_max_days_ahead"?: number,"bundle_pct"?: number,"cancel_cutoff_hours"?: number,"churn_weeks"?: number,"close_time"?: string,"commission_pct"?: number,"followup_window_days"?: number,"founded_year"?: number | null,"groom_text"?: string,"hero_text"?: string,"hero_title"?: string,"hero_title_accent"?: string,"id"?: boolean,"insight_aov_gap_pct"?: number,"insight_low_util_pct"?: number,"inventory_cost_method"?: string,"invite_code"?: string,"kpi_min_tx_for_stable"?: number,"maint_default_interval_days"?: number,"maps_embed_url"?: string,"margin_warning_pct"?: number,"min_monthly_pay"?: number,"online_booking_mode"?: string,"online_booking_open"?: boolean,"open_time"?: string,"privacy_policy"?: string,"reorder_suggest_multiplier"?: number,"retail_commission_pct"?: number,"retail_ratio_max"?: number,"retail_ratio_min"?: number,"return_window_days"?: number,"revenue_target_monthly"?: number,"shop_address"?: string,"shop_instagram"?: string,"shop_name"?: string,"shop_whatsapp"?: string,"show_prices"?: boolean,"show_staff"?: boolean,"sop_reminder_time"?: string,"sop_require_photo_autoclave"?: boolean,"sop_shift_names"?: (string)[],"sop_shifts"?: number,"standards"?: NonNullable<Json>,"tagline"?: string,"updated_at"?: string,"usage_variance_threshold_pct"?: number,"utilization_target"?: number,"wa_followup_template"?: string
                  }
                  Relationships: [
                    
                  ]
                },"site_photos": {
                  Row: {
                    "caption": string,"created_at": string,"id": string,"kind": string,"path": string,"sort": number
                  }
                  Insert: {
                    "caption"?: string,"created_at"?: string,"id"?: string,"kind": string,"path": string,"sort"?: number
                  }
                  Update: {
                    "caption"?: string,"created_at"?: string,"id"?: string,"kind"?: string,"path"?: string,"sort"?: number
                  }
                  Relationships: [
                    
                  ]
                },"sop_approvals": {
                  Row: {
                    "approved_by": string | null,"created_at": string,"date": string,"id": string,"shift": number
                  }
                  Insert: {
                    "approved_by"?: string | null,"created_at"?: string,"date": string,"id"?: string,"shift"?: number
                  }
                  Update: {
                    "approved_by"?: string | null,"created_at"?: string,"date"?: string,"id"?: string,"shift"?: number
                  }
                  Relationships: [
                    
                  ]
                },"sop_logs": {
                  Row: {
                    "created_at": string,"date": string,"done_by": string | null,"group_id": string,"id": string,"note": string,"on_behalf_staff_id": string | null,"photo_path": string | null,"shift": number,"stage": Database["public"]['Enums']["sop_stage"],"undone_at": string | null,"undone_by": string | null
                  }
                  Insert: {
                    "created_at"?: string,"date": string,"done_by"?: string | null,"group_id": string,"id"?: string,"note"?: string,"on_behalf_staff_id"?: string | null,"photo_path"?: string | null,"shift"?: number,"stage": Database["public"]['Enums']["sop_stage"],"undone_at"?: string | null,"undone_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"date"?: string,"done_by"?: string | null,"group_id"?: string,"id"?: string,"note"?: string,"on_behalf_staff_id"?: string | null,"photo_path"?: string | null,"shift"?: number,"stage"?: Database["public"]['Enums']["sop_stage"],"undone_at"?: string | null,"undone_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sop_logs_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "sop_tool_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sop_logs_on_behalf_staff_id_fkey"
      columns: ["on_behalf_staff_id"]
isOneToOne: false
      referencedRelation: "public_staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sop_logs_on_behalf_staff_id_fkey"
      columns: ["on_behalf_staff_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    }
                  ]
                },"sop_tool_groups": {
                  Row: {
                    "active": boolean,"description": string,"id": string,"name": string,"sort": number
                  }
                  Insert: {
                    "active"?: boolean,"description"?: string,"id"?: string,"name": string,"sort"?: number
                  }
                  Update: {
                    "active"?: boolean,"description"?: string,"id"?: string,"name"?: string,"sort"?: number
                  }
                  Relationships: [
                    
                  ]
                },"special_closures": {
                  Row: {
                    "date": string,"reason": string
                  }
                  Insert: {
                    "date": string,"reason"?: string
                  }
                  Update: {
                    "date"?: string,"reason"?: string
                  }
                  Relationships: [
                    
                  ]
                },"staff": {
                  Row: {
                    "active": boolean,"category": Database["public"]['Enums']["staff_category"],"commission_pct_override": number | null,"created_at": string,"home_resource_id": string | null,"id": string,"name": string,"photo_path": string | null,"sort": number
                  }
                  Insert: {
                    "active"?: boolean,"category": Database["public"]['Enums']["staff_category"],"commission_pct_override"?: number | null,"created_at"?: string,"home_resource_id"?: string | null,"id"?: string,"name": string,"photo_path"?: string | null,"sort"?: number
                  }
                  Update: {
                    "active"?: boolean,"category"?: Database["public"]['Enums']["staff_category"],"commission_pct_override"?: number | null,"created_at"?: string,"home_resource_id"?: string | null,"id"?: string,"name"?: string,"photo_path"?: string | null,"sort"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_home_resource_id_fkey"
      columns: ["home_resource_id"]
isOneToOne: false
      referencedRelation: "resources"
      referencedColumns: ["id"]
    }
                  ]
                },"staff_pins": {
                  Row: {
                    "failed_attempts": number,"locked_until": string | null,"pin_hash": string,"staff_id": string,"updated_at": string
                  }
                  Insert: {
                    "failed_attempts"?: number,"locked_until"?: string | null,"pin_hash": string,"staff_id": string,"updated_at"?: string
                  }
                  Update: {
                    "failed_attempts"?: number,"locked_until"?: string | null,"pin_hash"?: string,"staff_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_pins_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: true
      referencedRelation: "public_staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_pins_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: true
      referencedRelation: "staff"
      referencedColumns: ["id"]
    }
                  ]
                },"staff_review_notes": {
                  Row: {
                    "note": string,"staff_id": string,"updated_at": string,"updated_by": string | null,"year": number
                  }
                  Insert: {
                    "note"?: string,"staff_id": string,"updated_at"?: string,"updated_by"?: string | null,"year": number
                  }
                  Update: {
                    "note"?: string,"staff_id"?: string,"updated_at"?: string,"updated_by"?: string | null,"year"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_review_notes_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "public_staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_review_notes_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    }
                  ]
                },"staff_time_off": {
                  Row: {
                    "all_day": boolean,"created_at": string,"decided_at": string | null,"decided_by": string | null,"end_at": string,"id": string,"reason": string,"requested_by": string | null,"staff_id": string,"start_at": string,"status": Database["public"]['Enums']["time_off_status"]
                  }
                  Insert: {
                    "all_day"?: boolean,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"end_at": string,"id"?: string,"reason"?: string,"requested_by"?: string | null,"staff_id": string,"start_at": string,"status"?: Database["public"]['Enums']["time_off_status"]
                  }
                  Update: {
                    "all_day"?: boolean,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"end_at"?: string,"id"?: string,"reason"?: string,"requested_by"?: string | null,"staff_id"?: string,"start_at"?: string,"status"?: Database["public"]['Enums']["time_off_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_time_off_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "public_staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_time_off_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    }
                  ]
                },"station_devices": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"id": string,"last_seen_at": string | null,"name": string,"token_hash": string
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"last_seen_at"?: string | null,"name": string,"token_hash": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"last_seen_at"?: string | null,"name"?: string,"token_hash"?: string
                  }
                  Relationships: [
                    
                  ]
                },"stock_moves": {
                  Row: {
                    "attachment_path": string | null,"created_at": string,"created_by": string | null,"id": string,"invoice_no": string | null,"item_id": string,"note": string,"opname_id": string | null,"qty": number,"reason": string | null,"supplier_id": string | null,"transaction_id": string | null,"type": Database["public"]['Enums']["stock_move_type"],"unit_cost": number | null
                  }
                  Insert: {
                    "attachment_path"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"invoice_no"?: string | null,"item_id": string,"note"?: string,"opname_id"?: string | null,"qty": number,"reason"?: string | null,"supplier_id"?: string | null,"transaction_id"?: string | null,"type": Database["public"]['Enums']["stock_move_type"],"unit_cost"?: number | null
                  }
                  Update: {
                    "attachment_path"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"invoice_no"?: string | null,"item_id"?: string,"note"?: string,"opname_id"?: string | null,"qty"?: number,"reason"?: string | null,"supplier_id"?: string | null,"transaction_id"?: string | null,"type"?: Database["public"]['Enums']["stock_move_type"],"unit_cost"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_moves_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "inventory_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_moves_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "inventory_public"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_moves_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "stock_levels"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "stock_moves_opname_id_fkey"
      columns: ["opname_id"]
isOneToOne: false
      referencedRelation: "stock_opnames"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_moves_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_moves_transaction_id_fkey"
      columns: ["transaction_id"]
isOneToOne: false
      referencedRelation: "transactions"
      referencedColumns: ["id"]
    }
                  ]
                },"stock_opname_lines": {
                  Row: {
                    "counted_at": string | null,"counted_by": string | null,"counted_qty": number | null,"diff": number | null,"item_id": string,"opname_id": string,"system_qty": number,"unit_cost": number
                  }
                  Insert: {
                    "counted_at"?: string | null,"counted_by"?: string | null,"counted_qty"?: number | null,"diff"?: never,"item_id": string,"opname_id": string,"system_qty": number,"unit_cost": number
                  }
                  Update: {
                    "counted_at"?: string | null,"counted_by"?: string | null,"counted_qty"?: number | null,"diff"?: never,"item_id"?: string,"opname_id"?: string,"system_qty"?: number,"unit_cost"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_opname_lines_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "inventory_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_opname_lines_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "inventory_public"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_opname_lines_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "stock_levels"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "stock_opname_lines_opname_id_fkey"
      columns: ["opname_id"]
isOneToOne: false
      referencedRelation: "stock_opnames"
      referencedColumns: ["id"]
    }
                  ]
                },"stock_opnames": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"id": string,"note": string,"scope": string,"started_at": string,"started_by": string | null,"status": string
                  }
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"id"?: string,"note"?: string,"scope"?: string,"started_at"?: string,"started_by"?: string | null,"status"?: string
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"id"?: string,"note"?: string,"scope"?: string,"started_at"?: string,"started_by"?: string | null,"status"?: string
                  }
                  Relationships: [
                    
                  ]
                },"suppliers": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"name": string,"notes": string | null,"whatsapp": string | null
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"name": string,"notes"?: string | null,"whatsapp"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"name"?: string,"notes"?: string | null,"whatsapp"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"transaction_item_costs": {
                  Row: {
                    "hpp": number,"transaction_item_id": string
                  }
                  Insert: {
                    "hpp": number,"transaction_item_id": string
                  }
                  Update: {
                    "hpp"?: number,"transaction_item_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "transaction_item_costs_transaction_item_id_fkey"
      columns: ["transaction_item_id"]
isOneToOne: true
      referencedRelation: "transaction_items"
      referencedColumns: ["id"]
    }
                  ]
                },"transaction_items": {
                  Row: {
                    "appointment_id": string | null,"category": Database["public"]['Enums']["service_category"],"discount_share": number,"from_upsell": boolean,"id": string,"name": string,"net_amount": number,"price": number,"service_id": string | null,"staff_id": string | null,"transaction_id": string
                  }
                  Insert: {
                    "appointment_id"?: string | null,"category": Database["public"]['Enums']["service_category"],"discount_share"?: number,"from_upsell"?: boolean,"id"?: string,"name": string,"net_amount": number,"price": number,"service_id"?: string | null,"staff_id"?: string | null,"transaction_id": string
                  }
                  Update: {
                    "appointment_id"?: string | null,"category"?: Database["public"]['Enums']["service_category"],"discount_share"?: number,"from_upsell"?: boolean,"id"?: string,"name"?: string,"net_amount"?: number,"price"?: number,"service_id"?: string | null,"staff_id"?: string | null,"transaction_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "transaction_items_appointment_id_fkey"
      columns: ["appointment_id"]
isOneToOne: false
      referencedRelation: "appointments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transaction_items_appointment_id_fkey"
      columns: ["appointment_id"]
isOneToOne: false
      referencedRelation: "staff_my_appointments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transaction_items_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "public_services"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transaction_items_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "retail_stock"
      referencedColumns: ["service_id"]
    },{
      foreignKeyName: "transaction_items_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "service_margins"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transaction_items_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transaction_items_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "public_staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transaction_items_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transaction_items_transaction_id_fkey"
      columns: ["transaction_id"]
isOneToOne: false
      referencedRelation: "transactions"
      referencedColumns: ["id"]
    }
                  ]
                },"transactions": {
                  Row: {
                    "cash_received": number | null,"cashier_id": string | null,"created_at": string,"customer_id": string | null,"deposit_used": number,"discount_amount": number,"discount_label": string,"id": string,"paid_amount": number,"payment_method": Database["public"]['Enums']["pay_method"],"qris_ref": string | null,"subtotal": number,"total": number,"void_reason": string | null,"voided_at": string | null
                  }
                  Insert: {
                    "cash_received"?: number | null,"cashier_id"?: string | null,"created_at"?: string,"customer_id"?: string | null,"deposit_used"?: number,"discount_amount"?: number,"discount_label"?: string,"id"?: string,"paid_amount": number,"payment_method": Database["public"]['Enums']["pay_method"],"qris_ref"?: string | null,"subtotal": number,"total": number,"void_reason"?: string | null,"voided_at"?: string | null
                  }
                  Update: {
                    "cash_received"?: number | null,"cashier_id"?: string | null,"created_at"?: string,"customer_id"?: string | null,"deposit_used"?: number,"discount_amount"?: number,"discount_label"?: string,"id"?: string,"paid_amount"?: number,"payment_method"?: Database["public"]['Enums']["pay_method"],"qris_ref"?: string | null,"subtotal"?: number,"total"?: number,"void_reason"?: string | null,"voided_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "transactions_cashier_id_fkey"
      columns: ["cashier_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_cashier_id_fkey"
      columns: ["cashier_id"]
isOneToOne: false
      referencedRelation: "team_names"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customer_stats"
      referencedColumns: ["customer_id"]
    },{
      foreignKeyName: "transactions_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "my_customer"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "staff_customer_card"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "audit_feed": {
                  Row: {
                    "action": string | null,"actor": string | null,"actor_name": string | null,"actor_role": string | null,"at": string | null,"changes": Json | null,"entity": string | null,"entity_id": string | null,"id": number | null
                  }
                  Relationships: [
                    
                  ]
                },"customer_stats": {
                  Row: {
                    "customer_id": string | null,"deposit_balance": number | null,"is_churn": boolean | null,"last_visit_at": string | null,"lifetime_value": number | null,"visit_count": number | null
                  }
                  Relationships: [
                    
                  ]
                },"inventory_public": {
                  Row: {
                    "active": boolean | null,"id": string | null,"kind": Database["public"]['Enums']["item_kind"] | null,"name": string | null,"qty": number | null,"reorder_at": number | null,"unit": string | null
                  }
                  Relationships: [
                    
                  ]
                },"mv_daily_resource_minutes": {
                  Row: {
                    "actual_minus_planned": number | null,"day": string | null,"n_actual": number | null,"planned_minutes": number | null,"resource_id": string | null,"sold_minutes": number | null,"staff_id": string | null
                  }
                  Relationships: [
                    
                  ]
                },"mv_daily_sales": {
                  Row: {
                    "bundle_tx": number | null,"by_staff": boolean | null,"category": string | null,"day": string | null,"item_count": number | null,"revenue_net": number | null,"staff_id": string | null,"tx_count": number | null,"upsell_tx": number | null
                  }
                  Relationships: [
                    
                  ]
                },"my_customer": {
                  Row: {
                    "email": string | null,"id": string | null,"name": string | null,"whatsapp": string | null
                  }
                  Insert: {
                           "email"?: string | null,"id"?: string | null,"name"?: string | null,"whatsapp"?: string | null
                         }
                        Update: {
                           "email"?: string | null,"id"?: string | null,"name"?: string | null,"whatsapp"?: string | null
                         }
                        Relationships: [
                    
                  ]
                },"opname_sheet": {
                  Row: {
                    "counted_at": string | null,"counted_qty": number | null,"diff": number | null,"item_id": string | null,"kind": Database["public"]['Enums']["item_kind"] | null,"name": string | null,"opname_id": string | null,"system_qty": number | null,"unit": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_opname_lines_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "inventory_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_opname_lines_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "inventory_public"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_opname_lines_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "stock_levels"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "stock_opname_lines_opname_id_fkey"
      columns: ["opname_id"]
isOneToOne: false
      referencedRelation: "stock_opnames"
      referencedColumns: ["id"]
    }
                  ]
                },"public_deposit_packages": {
                  Row: {
                    "amount_credited": number | null,"amount_paid": number | null,"id": string | null,"name": string | null
                  }
                  Insert: {
                           "amount_credited"?: number | null,"amount_paid"?: number | null,"id"?: string | null,"name"?: string | null
                         }
                        Update: {
                           "amount_credited"?: number | null,"amount_paid"?: number | null,"id"?: string | null,"name"?: string | null
                         }
                        Relationships: [
                    
                  ]
                },"public_services": {
                  Row: {
                    "category": Database["public"]['Enums']["service_category"] | null,"duration_min": number | null,"id": string | null,"name": string | null,"needs_pedicure": boolean | null,"online_bookable": boolean | null,"price": number | null,"public_description": string | null,"sort": number | null,"upsell_service_id": string | null
                  }
                  Insert: {
                           "category"?: Database["public"]['Enums']["service_category"] | null,"duration_min"?: number | null,"id"?: string | null,"name"?: string | null,"needs_pedicure"?: boolean | null,"online_bookable"?: boolean | null,"price"?: number | null,"public_description"?: string | null,"sort"?: number | null,"upsell_service_id"?: string | null
                         }
                        Update: {
                           "category"?: Database["public"]['Enums']["service_category"] | null,"duration_min"?: number | null,"id"?: string | null,"name"?: string | null,"needs_pedicure"?: boolean | null,"online_bookable"?: boolean | null,"price"?: number | null,"public_description"?: string | null,"sort"?: number | null,"upsell_service_id"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "services_upsell_service_id_fkey"
      columns: ["upsell_service_id"]
isOneToOne: false
      referencedRelation: "public_services"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "services_upsell_service_id_fkey"
      columns: ["upsell_service_id"]
isOneToOne: false
      referencedRelation: "retail_stock"
      referencedColumns: ["service_id"]
    },{
      foreignKeyName: "services_upsell_service_id_fkey"
      columns: ["upsell_service_id"]
isOneToOne: false
      referencedRelation: "service_margins"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "services_upsell_service_id_fkey"
      columns: ["upsell_service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    }
                  ]
                },"public_settings": {
                  Row: {
                    "bloom_text": string | null,"booking_buffer_minutes": number | null,"booking_lead_minutes": number | null,"booking_max_days_ahead": number | null,"bundle_pct": number | null,"cancel_cutoff_hours": number | null,"churn_weeks": number | null,"close_time": string | null,"founded_year": number | null,"groom_text": string | null,"hero_text": string | null,"hero_title": string | null,"hero_title_accent": string | null,"maps_embed_url": string | null,"online_booking_mode": string | null,"online_booking_open": boolean | null,"open_time": string | null,"privacy_policy": string | null,"shop_address": string | null,"shop_instagram": string | null,"shop_name": string | null,"shop_whatsapp": string | null,"show_prices": boolean | null,"show_staff": boolean | null,"standards": Json | null,"tagline": string | null,"wa_followup_template": string | null
                  }
                  Insert: {
                           "bloom_text"?: string | null,"booking_buffer_minutes"?: number | null,"booking_lead_minutes"?: number | null,"booking_max_days_ahead"?: number | null,"bundle_pct"?: number | null,"cancel_cutoff_hours"?: number | null,"churn_weeks"?: number | null,"close_time"?: string | null,"founded_year"?: number | null,"groom_text"?: string | null,"hero_text"?: string | null,"hero_title"?: string | null,"hero_title_accent"?: string | null,"maps_embed_url"?: string | null,"online_booking_mode"?: string | null,"online_booking_open"?: boolean | null,"open_time"?: string | null,"privacy_policy"?: string | null,"shop_address"?: string | null,"shop_instagram"?: string | null,"shop_name"?: string | null,"shop_whatsapp"?: string | null,"show_prices"?: boolean | null,"show_staff"?: boolean | null,"standards"?: Json | null,"tagline"?: string | null,"wa_followup_template"?: string | null
                         }
                        Update: {
                           "bloom_text"?: string | null,"booking_buffer_minutes"?: number | null,"booking_lead_minutes"?: number | null,"booking_max_days_ahead"?: number | null,"bundle_pct"?: number | null,"cancel_cutoff_hours"?: number | null,"churn_weeks"?: number | null,"close_time"?: string | null,"founded_year"?: number | null,"groom_text"?: string | null,"hero_text"?: string | null,"hero_title"?: string | null,"hero_title_accent"?: string | null,"maps_embed_url"?: string | null,"online_booking_mode"?: string | null,"online_booking_open"?: boolean | null,"open_time"?: string | null,"privacy_policy"?: string | null,"shop_address"?: string | null,"shop_instagram"?: string | null,"shop_name"?: string | null,"shop_whatsapp"?: string | null,"show_prices"?: boolean | null,"show_staff"?: boolean | null,"standards"?: Json | null,"tagline"?: string | null,"wa_followup_template"?: string | null
                         }
                        Relationships: [
                    
                  ]
                },"public_staff": {
                  Row: {
                    "category": Database["public"]['Enums']["staff_category"] | null,"id": string | null,"name": string | null,"photo_path": string | null,"sort": number | null
                  }
                  Insert: {
                           "category"?: Database["public"]['Enums']["staff_category"] | null,"id"?: string | null,"name"?: string | null,"photo_path"?: string | null,"sort"?: number | null
                         }
                        Update: {
                           "category"?: Database["public"]['Enums']["staff_category"] | null,"id"?: string | null,"name"?: string | null,"photo_path"?: string | null,"sort"?: number | null
                         }
                        Relationships: [
                    
                  ]
                },"retail_stock": {
                  Row: {
                    "qty": number | null,"service_id": string | null
                  }
                  Relationships: [
                    
                  ]
                },"service_margins": {
                  Row: {
                    "active": boolean | null,"category": Database["public"]['Enums']["service_category"] | null,"commission": number | null,"contribution": number | null,"hpp": number | null,"id": string | null,"margin": number | null,"margin_pct": number | null,"name": string | null,"price": number | null
                  }
                  Relationships: [
                    
                  ]
                },"staff_customer_card": {
                  Row: {
                    "id": string | null,"name": string | null,"notes": string | null
                  }
                  Insert: {
                           "id"?: string | null,"name"?: string | null,"notes"?: string | null
                         }
                        Update: {
                           "id"?: string | null,"name"?: string | null,"notes"?: string | null
                         }
                        Relationships: [
                    
                  ]
                },"staff_my_appointments": {
                  Row: {
                    "arrived_at": string | null,"change_request": string | null,"change_requested_at": string | null,"changed_by_me": boolean | null,"customer_id": string | null,"customer_name": string | null,"customer_notes": string | null,"duration_min": number | null,"end_at": string | null,"id": string | null,"notes": string | null,"resource_id": string | null,"resource_name": string | null,"service_ended_at": string | null,"service_ids": (string)[] | null,"service_started_at": string | null,"source": Database["public"]['Enums']["appt_source"] | null,"start_at": string | null,"status": Database["public"]['Enums']["appt_status"] | null,"status_changed_at": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "appointments_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customer_stats"
      referencedColumns: ["customer_id"]
    },{
      foreignKeyName: "appointments_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appointments_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "my_customer"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appointments_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "staff_customer_card"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appointments_resource_id_fkey"
      columns: ["resource_id"]
isOneToOne: false
      referencedRelation: "resources"
      referencedColumns: ["id"]
    }
                  ]
                },"stock_levels": {
                  Row: {
                    "active": boolean | null,"item_id": string | null,"kind": Database["public"]['Enums']["item_kind"] | null,"name": string | null,"qty": number | null,"reorder_at": number | null,"status": string | null,"stock_value": number | null,"supplier_id": string | null,"unit": string | null,"unit_cost": number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_items_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"team_names": {
                  Row: {
                    "full_name": string | null,"id": string | null
                  }
                  Insert: {
                           "full_name"?: string | null,"id"?: string | null
                         }
                        Update: {
                           "full_name"?: string | null,"id"?: string | null
                         }
                        Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "adjust_stock":
{ Args: { "p_item_id": string,"p_note"?: string,"p_qty": number,"p_reason": string }; Returns: number
                           },
"advance_appointment_status":
{ Args: { "p_id": string }; Returns: Database["public"]['Enums']["appt_status"]
                           },
"approve_sop_day":
{ Args: { "p_date": string,"p_shift"?: number }; Returns: undefined
                           },
"appt_interval":
{ Args: { "a": Database["public"]['Tables']["appointments"]['Row'],"p_now": string }; Returns: Record<string, unknown>
                           },
"appt_minutes":
{ Args: { "a": Database["public"]['Tables']["appointments"]['Row'],"p_now": string }; Returns: number
                           },
"assert_booking_category":
{ Args: { "p_resource_id": string,"p_service_ids": (string)[],"p_staff_id": string }; Returns: undefined
                           },
"auth_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["app_role"]
                           },
"book_online":
{ Args: { "p": Json }; Returns: Json
                           },
"bookable_categories":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"booking_conflicts":
{ Args: { "p_end": string,"p_exclude"?: string,"p_resource_id": string,"p_staff_id": string,"p_start": string }; Returns: Json
                           },
"booking_unavailable_reason":
{ Args: { "p_date": string,"p_service_ids": (string)[],"p_staff_pick"?: Json }; Returns: string
                           },
"cancel_booking_admin":
{ Args: { "p_id": string,"p_reason": string }; Returns: undefined
                           },
"cancel_my_booking":
{ Args: { "p_id": string }; Returns: undefined
                           },
"cancel_time_off":
{ Args: { "p_id": string }; Returns: undefined
                           },
"cash_summary":
{ Args: { "p_date": string }; Returns: Json
                           },
"cash_summary_full":
{ Args: { "p_date": string }; Returns: Json
                           },
"checkout":
{ Args: { "p": Json }; Returns: string
                           },
"claim_hair_preview":
{ Args: { "p_id": string,"p_max": number }; Returns: boolean
                           },
"clear_staff_pin":
{ Args: { "p_staff_id": string }; Returns: undefined
                           },
"commission_for_period":
{ Args: { "p_month": string,"p_staff_id"?: string }; Returns: {
              "adjustments": number,"category": Database["public"]['Enums']["staff_category"],"closed": boolean,"commission_pct": number,"commission_retail": number,"commission_service": number,"hpp_total": number,"note": string,"paid_at": string,"paid_method": string,"revenue_net": number,"service_count": number,"staff_id": string,"staff_name": string,"subsidy": number,"total_pay": number
            }[]
                           },
"commission_items":
{ Args: { "p_month": string,"p_staff_id"?: string }; Returns: {
              "category": Database["public"]['Enums']["service_category"],"commission": number,"created_at": string,"from_upsell": boolean,"hpp": number,"name": string,"net_amount": number,"transaction_id": string,"transaction_item_id": string
            }[]
                           },
"commission_lines":
{ Args: { "p_month": string,"p_staff"?: string }; Returns: {
              "category": Database["public"]['Enums']["service_category"],"commission": number,"created_at": string,"from_upsell": boolean,"hpp": number,"name": string,"net_amount": number,"pct": number,"staff_id": string,"transaction_id": string,"transaction_item_id": string
            }[]
                           },
"commission_live":
{ Args: { "p_month": string }; Returns: {
              "adjustments": number,"category": Database["public"]['Enums']["staff_category"],"commission_pct": number,"commission_retail": number,"commission_service": number,"hpp_total": number,"revenue_net": number,"service_count": number,"staff_id": string,"staff_name": string,"subsidy": number,"total_pay": number
            }[]
                           },
"create_booking_admin":
{ Args: { "p_customer_id"?: string,"p_duration"?: number,"p_force"?: boolean,"p_name"?: string,"p_notes"?: string,"p_resource_id": string,"p_service_ids": (string)[],"p_source"?: Database["public"]['Enums']["appt_source"],"p_staff_id": string,"p_start_at": string,"p_whatsapp"?: string }; Returns: Json
                           },
"create_time_off_admin":
{ Args: { "p_all_day": boolean,"p_end": string,"p_reason": string,"p_staff_id": string,"p_start": string }; Returns: string
                           },
"daily_resource_minutes":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "actual_minus_planned": number | null,
"day": string | null,
"n_actual": number | null,
"planned_minutes": number | null,
"resource_id": string | null,
"sold_minutes": number | null,
"staff_id": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "mv_daily_resource_minutes"
        isOneToOne: false
        isSetofReturn: true
      } },
"daily_sales":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "bundle_tx": number | null,
"by_staff": boolean | null,
"category": string | null,
"day": string | null,
"item_count": number | null,
"revenue_net": number | null,
"staff_id": string | null,
"tx_count": number | null,
"upsell_tx": number | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "mv_daily_sales"
        isOneToOne: false
        isSetofReturn: true
      } },
"day_window":
{ Args: { "p_date": string }; Returns: {
              "close_m": number,"open_m": number
            }[]
                           },
"decide_time_off":
{ Args: { "p_approve": boolean,"p_id": string }; Returns: undefined
                           },
"delete_my_account":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"deposit_balance_of":
{ Args: { "cid": string }; Returns: number
                           },
"dismiss_change_request":
{ Args: { "p_id": string }; Returns: undefined
                           },
"enqueue_group_messages":
{ Args: { "p_group": string,"p_template": string }; Returns: undefined
                           },
"enqueue_reminders":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"fraud_overview":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"funnel_summary":
{ Args: { "p_from"?: string }; Returns: Json
                           },
"gen_booking_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"get_available_slots":
{ Args: { "p_date": string,"p_exclude_group"?: string,"p_service_ids": (string)[],"p_staff_pick"?: Json,"p_together"?: boolean }; Returns: string[]
                           },
"import_customers":
{ Args: { "p_rows": Json }; Returns: Json
                           },
"jkt":
{ Args: { "d": string,"t": string }; Returns: string
                           },
"jkt_today":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"kick_dispatch":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"kpi_aov_daily":
{ Args: { "p_category"?: string,"p_from": string,"p_staff_id"?: string,"p_to": string }; Returns: {
              "aov_barbershop": number,"aov_nail": number,"day": string,"omzet": number,"tx_barbershop": number,"tx_nail": number
            }[]
                           },
"kpi_aov_drivers":
{ Args: { "p_category"?: string,"p_from": string,"p_staff_id"?: string,"p_to": string }; Returns: {
              "avg_services": number,"bundle_pct": number,"category": string,"tx_count": number,"upsell_rate": number
            }[]
                           },
"kpi_customers":
{ Args: { "p_from": string,"p_to": string,"p_today"?: string }; Returns: Json
                           },
"kpi_dashboard":
{ Args: { "p_category"?: string,"p_from": string,"p_staff_id"?: string,"p_to": string }; Returns: Json
                           },
"kpi_duration_variance":
{ Args: { "p_category"?: string,"p_from": string,"p_staff_id"?: string,"p_to": string }; Returns: {
              "actual_avg": number,"diff_avg": number,"n": number,"name": string,"planned_min": number,"service_id": string
            }[]
                           },
"kpi_heatmap":
{ Args: { "p_category"?: string,"p_from": string,"p_staff_id"?: string,"p_to": string }; Returns: {
              "closed": boolean,"hour": number,"minutes_avg": number,"weekday": number
            }[]
                           },
"kpi_insights":
{ Args: { "p_category"?: string,"p_from": string,"p_staff_id"?: string,"p_to": string }; Returns: {
              "code": string,"href": string,"message": string,"priority": number
            }[]
                           },
"kpi_online":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"kpi_period":
{ Args: { "p_category"?: string,"p_from": string,"p_staff"?: string,"p_to": string }; Returns: Json
                           },
"kpi_retail":
{ Args: { "p_from": string,"p_staff_id"?: string,"p_to": string }; Returns: Json
                           },
"kpi_revenue_mix":
{ Args: { "p_from": string,"p_staff_id"?: string,"p_to": string }; Returns: Json
                           },
"kpi_summary":
{ Args: { "p_category"?: string,"p_from": string,"p_staff_id"?: string,"p_to": string }; Returns: Json
                           },
"kpi_utilization":
{ Args: { "p_category"?: string,"p_from": string,"p_staff_id"?: string,"p_to": string }; Returns: {
              "available_minutes": number,"n_actual": number,"name": string,"pct": number,"pct_planned": number,"planned_minutes": number,"planned_vs_actual_avg": number,"resource_id": string,"sold_minutes": number,"type": Database["public"]['Enums']["staff_category"]
            }[]
                           },
"link_customer_account":
{ Args: { "p_email": string,"p_name": string,"p_uid": string,"p_verified": boolean }; Returns: string
                           },
"lock_booking_day":
{ Args: { "d": string }; Returns: undefined
                           },
"maintenance_mark_done":
{ Args: { "p_cost"?: number,"p_note"?: string,"p_photo_path"?: string,"p_task_id": string,"p_vendor"?: string }; Returns: string
                           },
"maintenance_reminders":
{ Args: { "p_today"?: string }; Returns: number
                           },
"maintenance_state":
{ Args: { "p_days_left": number }; Returns: string
                           },
"maintenance_status":
{ Args: { "p_today"?: string }; Returns: {
              "active": boolean,"assignee": string,"assignee_staff_id": string,"days_left": number,"history": Json,"interval_days": number,"last_done_at": string,"name": string,"next_due": string,"procedure": string,"status": string,"task_id": string
            }[]
                           },
"maintenance_status_internal":
{ Args: { "p_today": string }; Returns: {
              "days_left": number,"name": string,"task_id": string
            }[]
                           },
"mark_no_show":
{ Args: { "p_id": string }; Returns: undefined
                           },
"mark_notifications_read":
{ Args: { "p_ids"?: (string)[] }; Returns: undefined
                           },
"month_bounds":
{ Args: { "p_month": string }; Returns: Record<string, unknown>
                           },
"my_customer_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"my_staff_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"new_unit_cost":
{ Args: { "p_cost": number,"p_method": string,"p_old_cost": number,"p_old_qty": number,"p_qty": number }; Returns: number
                           },
"next_available_date":
{ Args: { "p_from": string,"p_service_ids": (string)[],"p_staff_pick"?: Json,"p_together"?: boolean }; Returns: string
                           },
"normalize_wa":
{ Args: { "raw": string }; Returns: string
                           },
"notify":
{ Args: { "p_kind": string,"p_payload": Json,"p_role": Database["public"]['Enums']["app_role"],"p_user"?: string }; Returns: undefined
                           },
"open_minutes":
{ Args: { "p_from": string,"p_to": string }; Returns: number
                           },
"opname_approve":
{ Args: { "p_opname_id": string }; Returns: Json
                           },
"opname_cancel":
{ Args: { "p_opname_id": string }; Returns: undefined
                           },
"opname_save_counts":
{ Args: { "p_lines": Json,"p_opname_id": string }; Returns: number
                           },
"opname_start":
{ Args: { "p_scope": string }; Returns: string
                           },
"owner_daily":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"owner_finance":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"owner_inventory":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"owner_operations":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"owner_payroll":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"owner_report":
{ Args: { "p_from": string,"p_ly_from": string,"p_ly_to": string,"p_prev_from": string,"p_prev_to": string,"p_to": string }; Returns: Json
                           },
"owner_revenue_target":
{ Args: { "p_from": string,"p_to": string }; Returns: number
                           },
"owner_services":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"owner_staff":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"owner_summary":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"owner_top_customers":
{ Args: { "p_from": string,"p_limit"?: number,"p_to": string }; Returns: Json
                           },
"payroll_add_adjustment":
{ Args: { "p_amount": number,"p_kind": string,"p_month": string,"p_reason": string,"p_staff_id": string }; Returns: string
                           },
"payroll_close":
{ Args: { "p_month": string }; Returns: number
                           },
"payroll_mark_paid":
{ Args: { "p_method": string,"p_month": string,"p_note"?: string,"p_paid_at"?: string,"p_staff_id": string }; Returns: undefined
                           },
"payroll_reopen":
{ Args: { "p_month": string,"p_reason": string }; Returns: undefined
                           },
"pct1":
{ Args: { "v": number }; Returns: string
                           },
"period_is_closed":
{ Args: { "p_at": string }; Returns: boolean
                           },
"plan_booking":
{ Args: { "p_buffer"?: number,"p_date": string,"p_exclude_group"?: string,"p_service_ids": (string)[],"p_staff_pick": Json,"p_start": number,"p_together": boolean }; Returns: Json
                           },
"preview_booking":
{ Args: { "p_date": string,"p_service_ids": (string)[],"p_staff_pick"?: Json,"p_time": string,"p_together"?: boolean }; Returns: Json
                           },
"public_staff_off":
{ Args: { "p_date": string }; Returns: string[]
                           },
"receive_stock":
{ Args: { "p_attachment_path"?: string,"p_invoice_no"?: string,"p_item_id": string,"p_note"?: string,"p_qty": number,"p_supplier_id"?: string,"p_unit_cost": number }; Returns: Json
                           },
"record_sop_stage":
{ Args: { "p_group_id": string,"p_note"?: string,"p_on_behalf_staff"?: string,"p_photo_path"?: string,"p_shift"?: number,"p_stage": Database["public"]['Enums']["sop_stage"] }; Returns: string
                           },
"refresh_analytics":
{ Args: { "p_force"?: boolean }; Returns: undefined
                           },
"register_station":
{ Args: { "p_name": string,"p_token_hash": string }; Returns: string
                           },
"request_schedule_change":
{ Args: { "p_id": string,"p_message": string }; Returns: undefined
                           },
"request_time_off":
{ Args: { "p_all_day": boolean,"p_end": string,"p_reason": string,"p_start": string }; Returns: string
                           },
"require_role":
{ Args: { "roles": (Database["public"]['Enums']["app_role"])[] }; Returns: undefined
                           },
"resource_rows":
{ Args: { "p_a": string,"p_b": string }; Returns: {
              "actual_minus_planned": number,"day": string,"n_actual": number,"planned_minutes": number,"resource_id": string,"sold_minutes": number,"staff_id": string
            }[]
                           },
"revert_my_status":
{ Args: { "p_id": string }; Returns: Database["public"]['Enums']["appt_status"]
                           },
"review_online_booking":
{ Args: { "p_accept": boolean,"p_group": string,"p_reason"?: string }; Returns: Json
                           },
"sales_rows":
{ Args: { "p_a": string,"p_b": string }; Returns: {
              "bundle_tx": number,"by_staff": boolean,"category": string,"day": string,"item_count": number,"revenue_net": number,"staff_id": string,"tx_count": number,"upsell_tx": number
            }[]
                           },
"save_cash_closing":
{ Args: { "p_date": string,"p_note"?: string,"p_physical_cash": number }; Returns: string
                           },
"save_push_subscription":
{ Args: { "p_auth": string,"p_endpoint": string,"p_p256dh": string }; Returns: undefined
                           },
"save_recipe":
{ Args: { "p_lines": Json,"p_service_id": string }; Returns: number
                           },
"service_hpp":
{ Args: { "sid": string }; Returns: number
                           },
"set_appointment_status":
{ Args: { "p_id": string,"p_status": Database["public"]['Enums']["appt_status"] }; Returns: undefined
                           },
"set_staff_pin":
{ Args: { "p_pin": string,"p_staff_id": string }; Returns: undefined
                           },
"set_unit_cost":
{ Args: { "p_item_id": string,"p_reason": string,"p_unit_cost": number }; Returns: undefined
                           },
"shopping_list":
{ Args: Record<PropertyKey, never>; Returns: {
              "est_cost": number,"item_id": string,"kind": Database["public"]['Enums']["item_kind"],"name": string,"qty": number,"reorder_at": number,"status": string,"suggested": number,"supplier_id": string,"supplier_name": string,"supplier_whatsapp": string,"unit": string,"unit_cost": number
            }[]
                           },
"sop_compliance_report":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"sop_config":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"sop_day":
{ Args: { "p_date": string,"p_shift"?: number }; Returns: Json
                           },
"sop_history":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "date": string,"done": number,"shift": number,"status": string,"total": number
            }[]
                           },
"sop_reminders":
{ Args: { "p_now"?: string }; Returns: number
                           },
"sop_status":
{ Args: { "p_approved": boolean,"p_closed": boolean,"p_done": number,"p_total": number }; Returns: string
                           },
"staff_annual_review":
{ Args: { "p_year": number }; Returns: {
              "avg_per_service": number,"category": Database["public"]['Enums']["staff_category"],"note": string,"off_days": number,"return_rate": number,"revenue_net": number,"service_count": number,"staff_id": string,"staff_name": string,"total_paid": number,"upsell_rate": number,"work_days": number
            }[]
                           },
"staff_commission_terms":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"staff_customer_history":
{ Args: { "p_customer_id": string }; Returns: {
              "notes": string,"services": string,"start_at": string
            }[]
                           },
"staff_leaderboard":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "avg_per_service": number,"category": Database["public"]['Enums']["staff_category"],"of_count": number,"rank": number,"revenue_net": number,"service_count": number,"staff_id": string,"staff_name": string
            }[]
                           },
"staff_pin_status":
{ Args: Record<PropertyKey, never>; Returns: {
              "has_pin": boolean,"locked_until": string,"staff_id": string,"updated_at": string
            }[]
                           },
"station_staff":
{ Args: { "p_token_hash": string }; Returns: {
              "category": Database["public"]['Enums']["staff_category"],"has_pin": boolean,"name": string,"staff_id": string
            }[]
                           },
"stock_of":
{ Args: { "p_item": string }; Returns: number
                           },
"time_off_conflicts":
{ Args: { "p_id": string }; Returns: Json
                           },
"topup_deposit":
{ Args: { "p_amount_credited"?: number,"p_amount_paid"?: number,"p_customer_id": string,"p_method": string,"p_package_id"?: string,"p_qris_ref"?: string }; Returns: string
                           },
"track_funnel":
{ Args: { "p_session": string,"p_step": string }; Returns: undefined
                           },
"undo_sop_stage":
{ Args: { "p_log_id": string }; Returns: undefined
                           },
"unpaid_completed_alerts":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"update_booking_admin":
{ Args: { "p_duration"?: number,"p_force"?: boolean,"p_id": string,"p_notes"?: string,"p_resource_id": string,"p_service_ids": (string)[],"p_staff_id": string,"p_start_at": string }; Returns: Json
                           },
"update_customer_notes":
{ Args: { "p_customer_id": string,"p_notes": string }; Returns: undefined
                           },
"update_my_profile":
{ Args: { "p_name": string }; Returns: undefined
                           },
"usage_report":
{ Args: { "p_from_opname": string,"p_to_opname": string }; Returns: {
              "actual": number,"flagged": boolean,"item_id": string,"name": string,"theoretical": number,"unit": string,"unit_cost": number,"variance": number,"variance_pct": number,"variance_value": number
            }[]
                           },
"verify_staff_pin":
{ Args: { "p_pin": string,"p_staff_id": string,"p_token_hash": string }; Returns: Json
                           },
"void_transaction":
{ Args: { "p_id": string,"p_reason": string }; Returns: undefined
                           }
          }
          Enums: {
            "app_role": "manager"|"cashier"|"staff"|"customer","appt_source": "admin"|"walk_in"|"whatsapp"|"online","appt_status": "pending_review"|"booked"|"arrived"|"in_service"|"completed"|"paid"|"no_show"|"cancelled","item_kind": "consumable"|"retail","pay_method": "cash"|"qris"|"deposit"|"deposit_cash"|"deposit_qris","service_category": "barbershop"|"nail"|"retail","sop_stage": "wash"|"soak"|"autoclave","staff_category": "barbershop"|"nail","stock_move_type": "in"|"use"|"sale"|"opname"|"adjust","time_off_status": "pending"|"approved"|"rejected"|"cancelled"
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
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "app_role": ["manager", "cashier", "staff", "customer"],"appt_source": ["admin", "walk_in", "whatsapp", "online"],"appt_status": ["pending_review", "booked", "arrived", "in_service", "completed", "paid", "no_show", "cancelled"],"item_kind": ["consumable", "retail"],"pay_method": ["cash", "qris", "deposit", "deposit_cash", "deposit_qris"],"service_category": ["barbershop", "nail", "retail"],"sop_stage": ["wash", "soak", "autoclave"],"staff_category": ["barbershop", "nail"],"stock_move_type": ["in", "use", "sale", "opname", "adjust"],"time_off_status": ["pending", "approved", "rejected", "cancelled"]
          }
        }
} as const

