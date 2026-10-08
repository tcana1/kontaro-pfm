export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_import_rules: {
        Row: {
          account_id: number
          bank: string
          created_at: string | null
          filename_pattern: string | null
          id: string
          text_pattern: string | null
          type: string
          user_id: string
        }
        Insert: {
          account_id: number
          bank: string
          created_at?: string | null
          filename_pattern?: string | null
          id?: string
          text_pattern?: string | null
          type: string
          user_id: string
        }
        Update: {
          account_id?: number
          bank?: string
          created_at?: string | null
          filename_pattern?: string | null
          id?: string
          text_pattern?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_import_rules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_import_rules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_splits"
            referencedColumns: ["account_id"]
          },
        ]
      }
      account_types: {
        Row: {
          created_at: string | null
          description: string | null
          id: number
          name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: number
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: number
          name?: string
        }
        Relationships: []
      }
      accounts: {
        Row: {
          created_at: string | null
          icon: string | null
          id: number
          is_active: boolean | null
          last4: string | null
          name: string
          slug: string
          starting_balance_temp: number | null
          type_id: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          icon?: string | null
          id?: number
          is_active?: boolean | null
          last4?: string | null
          name: string
          slug: string
          starting_balance_temp?: number | null
          type_id?: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          icon?: string | null
          id?: number
          is_active?: boolean | null
          last4?: string | null
          name?: string
          slug?: string
          starting_balance_temp?: number | null
          type_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "account_types"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_state: {
        Row: {
          created_at: string | null
          id: number
          month: string
          state: Json
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          month: string
          state: Json
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: number
          month?: string
          state?: Json
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          color: string | null
          created_at: string | null
          group_id: number
          id: number
          name: string
          user_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          group_id: number
          id?: number
          name: string
          user_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          group_id?: number
          id?: number
          name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_category_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "category_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_category_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_splits"
            referencedColumns: ["category_group_id"]
          },
        ]
      }
      categorization_rules: {
        Row: {
          category_id: number
          id: number
          payee_keyword: string
          user_id: string
        }
        Insert: {
          category_id: number
          id?: number
          payee_keyword: string
          user_id: string
        }
        Update: {
          category_id?: number
          id?: number
          payee_keyword?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categorization_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categorization_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_splits"
            referencedColumns: ["category_id"]
          },
        ]
      }
      category_groups: {
        Row: {
          color: string | null
          created_at: string | null
          emoji: string | null
          id: number
          is_income: boolean
          name: string
          user_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          emoji?: string | null
          id?: number
          is_income?: boolean
          name: string
          user_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          emoji?: string | null
          id?: number
          is_income?: boolean
          name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      connector_accounts: {
        Row: {
          account_id: number
          connector_id: string
          id: string
          name: string
          pluggy_account_id: string
          type: string
          user_id: string
        }
        Insert: {
          account_id: number
          connector_id: string
          id?: string
          name: string
          pluggy_account_id: string
          type: string
          user_id: string
        }
        Update: {
          account_id?: number
          connector_id?: string
          id?: string
          name?: string
          pluggy_account_id?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connector_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connector_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_splits"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "connector_accounts_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: false
            referencedRelation: "connectors"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_sync_state: {
        Row: {
          connector_account_id: string
          id: string
          last_error: string | null
          last_sync_at: string | null
          last_synced_created_at: string | null
          user_id: string
        }
        Insert: {
          connector_account_id: string
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          last_synced_created_at?: string | null
          user_id: string
        }
        Update: {
          connector_account_id?: string
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          last_synced_created_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connector_sync_state_connector_account_id_fkey"
            columns: ["connector_account_id"]
            isOneToOne: false
            referencedRelation: "connector_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      connectors: {
        Row: {
          client_id: string
          client_secret_enc: string
          created_at: string | null
          enabled: boolean
          id: string
          import_from: string | null
          pluggy_item_id: string | null
          provider: string
          schedule: string
          timezone: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          client_id: string
          client_secret_enc: string
          created_at?: string | null
          enabled?: boolean
          id?: string
          import_from?: string | null
          pluggy_item_id?: string | null
          provider?: string
          schedule?: string
          timezone?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          client_id?: string
          client_secret_enc?: string
          created_at?: string | null
          enabled?: boolean
          id?: string
          import_from?: string | null
          pluggy_item_id?: string | null
          provider?: string
          schedule?: string
          timezone?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          account_id: number | null
          created_at: string | null
          error_text: string | null
          errors: Json
          failed_count: number
          file_name: string | null
          finished_at: string | null
          id: string
          inserted_count: number
          source: string | null
          status: string
          total_amount: number
          transaction_count: number
          user_id: string
        }
        Insert: {
          account_id?: number | null
          created_at?: string | null
          error_text?: string | null
          errors?: Json
          failed_count?: number
          file_name?: string | null
          finished_at?: string | null
          id?: string
          inserted_count?: number
          source?: string | null
          status?: string
          total_amount?: number
          transaction_count?: number
          user_id: string
        }
        Update: {
          account_id?: number | null
          created_at?: string | null
          error_text?: string | null
          errors?: Json
          failed_count?: number
          file_name?: string | null
          finished_at?: string | null
          id?: string
          inserted_count?: number
          source?: string | null
          status?: string
          total_amount?: number
          transaction_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_splits"
            referencedColumns: ["account_id"]
          },
        ]
      }
      insight_runs: {
        Row: {
          content: string
          created_at: string
          id: number
          model: string
          month: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: number
          model: string
          month: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: number
          model?: string
          month?: string
          user_id?: string
        }
        Relationships: []
      }
      payees: {
        Row: {
          created_at: string | null
          default_category_id: number | null
          id: number
          name: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          default_category_id?: number | null
          id?: number
          name: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          default_category_id?: number | null
          id?: number
          name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payees_default_category_id_fkey"
            columns: ["default_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payees_default_category_id_fkey"
            columns: ["default_category_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_splits"
            referencedColumns: ["category_id"]
          },
        ]
      }
      reconciliation_items: {
        Row: {
          id: number
          reconciled_at: string | null
          reconciliation_id: number
          transaction_id: number
        }
        Insert: {
          id?: number
          reconciled_at?: string | null
          reconciliation_id: number
          transaction_id: number
        }
        Update: {
          id?: number
          reconciled_at?: string | null
          reconciliation_id?: number
          transaction_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_items_reconciliation_id_fkey"
            columns: ["reconciliation_id"]
            isOneToOne: false
            referencedRelation: "reconciliations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_splits"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      reconciliations: {
        Row: {
          account_id: number
          bank_balance: number
          calculated_balance: number
          created_at: string | null
          deleted_at: string | null
          end_date: string
          id: number
          notes: string | null
          reconciliation_date: string
          reconciliation_type: string
          start_date: string
          status: string
          user_id: string
        }
        Insert: {
          account_id: number
          bank_balance: number
          calculated_balance: number
          created_at?: string | null
          deleted_at?: string | null
          end_date: string
          id?: number
          notes?: string | null
          reconciliation_date: string
          reconciliation_type?: string
          start_date: string
          status?: string
          user_id?: string
        }
        Update: {
          account_id?: number
          bank_balance?: number
          calculated_balance?: number
          created_at?: string | null
          deleted_at?: string | null
          end_date?: string
          id?: number
          notes?: string | null
          reconciliation_date?: string
          reconciliation_type?: string
          start_date?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_splits"
            referencedColumns: ["account_id"]
          },
        ]
      }
      settings: {
        Row: {
          currency: string
          date_format: string
          id: number
          locale: string
          onboarded: boolean
          theme: string
          user_id: string
        }
        Insert: {
          currency?: string
          date_format?: string
          id?: number
          locale?: string
          onboarded?: boolean
          theme?: string
          user_id: string
        }
        Update: {
          currency?: string
          date_format?: string
          id?: number
          locale?: string
          onboarded?: boolean
          theme?: string
          user_id?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          archived: boolean
          color: string
          created_at: string | null
          id: number
          name: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          color?: string
          created_at?: string | null
          id?: number
          name: string
          user_id?: string
        }
        Update: {
          archived?: boolean
          color?: string
          created_at?: string | null
          id?: number
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      transaction_match_candidates: {
        Row: {
          confidence: string
          created_at: string | null
          id: number
          score: number
          status: string
          transaction_a_id: number
          transaction_b_id: number
          user_id: string
        }
        Insert: {
          confidence: string
          created_at?: string | null
          id?: number
          score: number
          status?: string
          transaction_a_id: number
          transaction_b_id: number
          user_id: string
        }
        Update: {
          confidence?: string
          created_at?: string | null
          id?: number
          score?: number
          status?: string
          transaction_a_id?: number
          transaction_b_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_match_candidates_transaction_a_id_fkey"
            columns: ["transaction_a_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_match_candidates_transaction_a_id_fkey"
            columns: ["transaction_a_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_splits"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "transaction_match_candidates_transaction_b_id_fkey"
            columns: ["transaction_b_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_match_candidates_transaction_b_id_fkey"
            columns: ["transaction_b_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_splits"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      transaction_splits: {
        Row: {
          amount: number
          category_id: number
          created_at: string | null
          id: number
          observation: string | null
          transaction_id: number
        }
        Insert: {
          amount: number
          category_id?: number
          created_at?: string | null
          id?: number
          observation?: string | null
          transaction_id: number
        }
        Update: {
          amount?: number
          category_id?: number
          created_at?: string | null
          id?: number
          observation?: string | null
          transaction_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "transaction_splits_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_splits_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_splits"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "transaction_splits_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_splits_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_splits"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      transaction_statuses: {
        Row: {
          id: number
          name: string
        }
        Insert: {
          id?: number
          name: string
        }
        Update: {
          id?: number
          name?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          account_id: number
          amount: number | null
          created_at: string | null
          id: number
          import_batch_id: string | null
          installment_number: number | null
          installment_total: number | null
          is_ignored: boolean | null
          is_installment: boolean | null
          notes: string | null
          payee: string
          payee_id: number | null
          payment_date: string
          purchase_date: string
          statement_identifier: string | null
          status_id: number
          tag_id: number | null
          to_account_id: number | null
          transfer_link_id: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          unique_hash: string
          user_id: string
        }
        Insert: {
          account_id: number
          amount?: number | null
          created_at?: string | null
          id?: number
          import_batch_id?: string | null
          installment_number?: number | null
          installment_total?: number | null
          is_ignored?: boolean | null
          is_installment?: boolean | null
          notes?: string | null
          payee: string
          payee_id?: number | null
          payment_date: string
          purchase_date: string
          statement_identifier?: string | null
          status_id?: number
          tag_id?: number | null
          to_account_id?: number | null
          transfer_link_id?: string | null
          type?: Database["public"]["Enums"]["transaction_type"]
          unique_hash: string
          user_id: string
        }
        Update: {
          account_id?: number
          amount?: number | null
          created_at?: string | null
          id?: number
          import_batch_id?: string | null
          installment_number?: number | null
          installment_total?: number | null
          is_ignored?: boolean | null
          is_installment?: boolean | null
          notes?: string | null
          payee?: string
          payee_id?: number | null
          payment_date?: string
          purchase_date?: string
          statement_identifier?: string | null
          status_id?: number
          tag_id?: number | null
          to_account_id?: number | null
          transfer_link_id?: string | null
          type?: Database["public"]["Enums"]["transaction_type"]
          unique_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_splits"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "transactions_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "payees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "transaction_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_splits"
            referencedColumns: ["status_id"]
          },
          {
            foreignKeyName: "transactions_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_splits"
            referencedColumns: ["account_id"]
          },
        ]
      }
      user_api_keys: {
        Row: {
          created_at: string | null
          id: string
          key_hash: string
          key_plaintext_once: string | null
          key_preview: string
          last_used_at: string | null
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          key_hash: string
          key_plaintext_once?: string | null
          key_preview: string
          last_used_at?: string | null
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          key_hash?: string
          key_plaintext_once?: string | null
          key_preview?: string
          last_used_at?: string | null
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_openexchange_keys: {
        Row: {
          key_enc: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          key_enc: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          key_enc?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_pdf_passwords: {
        Row: {
          created_at: string | null
          id: string
          label: string
          password_enc: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          label: string
          password_enc: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          label?: string
          password_enc?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_payee_transaction_counts: {
        Row: {
          default_category_id: number | null
          id: number | null
          name: string | null
          transaction_count: number | null
        }
        Relationships: []
      }
      v_transaction_splits: {
        Row: {
          account_icon: string | null
          account_id: number | null
          account_name: string | null
          account_name_unaccented: string | null
          account_type: string | null
          amount: number | null
          category_color: string | null
          category_group_emoji: string | null
          category_group_id: number | null
          category_group_name: string | null
          category_group_name_unaccented: string | null
          category_id: number | null
          category_is_income: boolean | null
          category_name: string | null
          category_name_unaccented: string | null
          installment_number: number | null
          installment_total: number | null
          is_ignored: boolean | null
          is_installment: boolean | null
          is_reconciled: boolean | null
          observation: string | null
          observation_unaccented: string | null
          payee: string | null
          payee_unaccented: string | null
          payment_date: string | null
          purchase_date: string | null
          split_id: number | null
          status_id: number | null
          status_name: string | null
          tag_color: string | null
          tag_id: number | null
          tag_name: string | null
          tag_name_unaccented: string | null
          to_account_id: number | null
          to_account_name: string | null
          transaction_amount: number | null
          transaction_id: number | null
          type: Database["public"]["Enums"]["transaction_type"] | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "v_transaction_splits"
            referencedColumns: ["account_id"]
          },
        ]
      }
    }
    Functions: {
      check_reconciliation_difference: {
        Args: {
          p_account_id: number
          p_bank_balance: number
          p_transaction_ids: number[]
        }
        Returns: Json
      }
      collapse_transactions: {
        Args: {
          p_base_id: number
          p_other_ids: number[]
          p_resolved_fields: Json
        }
        Returns: undefined
      }
      convert_transaction_to_linked: {
        Args: { p_transaction_id: number; p_updates: Json }
        Returns: Json
      }
      count_filtered_transactions: {
        Args: {
          p_accounts?: number[]
          p_amount?: number
          p_amount_tolerance?: number
          p_categories?: number[]
          p_date_from?: string
          p_date_to?: string
          p_ignored?: boolean
          p_search?: string
          p_status?: string[]
          p_tags?: number[]
          p_user_id?: string
        }
        Returns: number
      }
      create_category_groups_and_categories: {
        Args: { p_groups: Json }
        Returns: undefined
      }
      create_linked_transactions: {
        Args: { p_transaction_data: Json }
        Returns: Json
      }
      create_reconciliation: {
        Args: {
          p_account_id: number
          p_bank_balance: number
          p_end_date: string
          p_notes?: string
          p_reconciliation_date: string
          p_start_date: string
          p_transaction_ids: number[]
        }
        Returns: Json
      }
      create_transaction_with_splits: {
        Args: { p_splits: Json; p_transaction: Json }
        Returns: Json
      }
      delete_category_and_move_transactions: {
        Args: { p_item_id: number; p_target_category_id: number }
        Returns: undefined
      }
      delete_category_and_transactions: {
        Args: { p_item_id: number }
        Returns: undefined
      }
      delete_category_group_and_move_transactions: {
        Args: { p_item_id: number; p_target_category_id: number }
        Returns: undefined
      }
      delete_category_group_and_transactions: {
        Args: { p_item_id: number }
        Returns: undefined
      }
      delete_reconciliation_adjustment_transaction: {
        Args: { p_transaction_id: number }
        Returns: Json
      }
      dismiss_match: {
        Args: { p_match_candidate_id: number }
        Returns: undefined
      }
      explode_transaction: {
        Args: { p_transaction_id: number }
        Returns: number[]
      }
      find_and_mark_matches: {
        Args: { p_account_id: number; p_user_id: string }
        Returns: number
      }
      find_matches_for_transaction: {
        Args: { p_tx_id: number }
        Returns: number
      }
      generate_slug: { Args: { input_text: string }; Returns: string }
      generate_unique_slug: {
        Args: { input_name: string; user_uuid: string }
        Returns: string
      }
      get_account_balance_from_last_reconciliation: {
        Args: { p_account_id: number; p_as_of_date?: string }
        Returns: {
          current_calculated_balance: number
          last_reconciliation_balance: number
          last_reconciliation_date: string
          transactions_since_reconciliation: number
        }[]
      }
      get_account_balances: {
        Args: { account_id_param?: number; p_today?: string }
        Returns: {
          account_id: number
          account_name: string
          account_type_id: number
          cleared_balance: number
          pending_balance: number
          starting_balance: number
          total_balance: number
        }[]
      }
      get_analysis_state: { Args: { p_month?: string }; Returns: Json }
      get_category_ranking: {
        Args: {
          end_date: string
          input_account_ids?: number[]
          input_category_ids?: number[]
          input_excluded_tag_ids?: number[]
          input_group_ids?: number[]
          sort_by?: string
          start_date: string
        }
        Returns: Json
      }
      get_daily_spending: {
        Args: {
          end_date: string
          input_account_ids?: number[]
          input_category_ids?: number[]
          input_excluded_tag_ids?: number[]
          input_group_ids?: number[]
          start_date: string
        }
        Returns: Json
      }
      get_dashboard_category_trends: {
        Args: { p_limit?: number; p_month: string }
        Returns: Json
      }
      get_dashboard_installments: { Args: { p_month: string }; Returns: Json }
      get_dashboard_monthly_totals: { Args: { p_month: string }; Returns: Json }
      get_dashboard_surprises: {
        Args: {
          p_baseline_months?: number
          p_min_baseline?: number
          p_month: string
          p_threshold?: number
        }
        Returns: Json
      }
      get_expense_breakdown: {
        Args: {
          end_date: string
          input_account_ids?: number[]
          input_category_ids?: number[]
          input_excluded_tag_ids?: number[]
          input_group_ids?: number[]
          start_date: string
        }
        Returns: {
          color: string
          group_id: number
          label: string
          unique_months: number
          value: number
        }[]
      }
      get_expense_trends: {
        Args: {
          end_date: string
          input_account_ids?: number[]
          input_category_ids?: number[]
          input_excluded_tag_ids?: number[]
          input_group_ids?: number[]
          start_date: string
        }
        Returns: {
          color: string
          group_id: number
          label: string
          month: string
          value: number
        }[]
      }
      get_income_vs_expenses: {
        Args: {
          end_date: string
          input_account_ids?: number[]
          input_category_ids?: number[]
          input_excluded_tag_ids?: number[]
          input_group_ids?: number[]
          start_date: string
        }
        Returns: Json
      }
      get_income_vs_expenses_multi_year: {
        Args: {
          end_date: string
          input_account_ids?: number[]
          input_category_ids?: number[]
          input_excluded_tag_ids?: number[]
          input_group_ids?: number[]
          start_date: string
        }
        Returns: Json
      }
      get_insight_run: { Args: { p_month: string }; Returns: Json }
      get_largest_transactions: {
        Args: { p_end: string; p_limit?: number; p_start: string }
        Returns: Json
      }
      get_merchant_scatter: {
        Args: {
          end_date: string
          input_account_ids?: number[]
          input_category_ids?: number[]
          input_excluded_tag_ids?: number[]
          input_group_ids?: number[]
          start_date: string
        }
        Returns: Json
      }
      get_month_close: { Args: { p_month: string }; Returns: Json }
      get_new_merchants: {
        Args: { p_lookback_months?: number; p_month: string }
        Returns: Json
      }
      get_reconciliation_info_for_adjustment: {
        Args: { p_transaction_id: number }
        Returns: Json
      }
      get_reimbursements: {
        Args: { p_end: string; p_start: string }
        Returns: Json
      }
      get_seasonal_pattern: {
        Args: {
          end_date: string
          input_account_ids?: number[]
          input_category_ids?: number[]
          input_excluded_tag_ids?: number[]
          input_group_ids?: number[]
          start_date: string
        }
        Returns: Json
      }
      get_tag_summary: { Args: { p_tag_id: number }; Returns: Json }
      get_ticket_size_stats: {
        Args: {
          end_date: string
          input_account_ids?: number[]
          input_category_ids?: number[]
          input_excluded_tag_ids?: number[]
          input_group_ids?: number[]
          start_date: string
        }
        Returns: Json
      }
      get_top_merchants_for_category: {
        Args: {
          end_date: string
          input_account_ids?: number[]
          input_category_id: number
          limit_n?: number
          start_date: string
        }
        Returns: Json
      }
      get_transaction_size_distribution: {
        Args: {
          bucket_size?: number
          end_date: string
          input_account_ids?: number[]
          input_category_ids?: number[]
          input_excluded_tag_ids?: number[]
          input_group_ids?: number[]
          start_date: string
        }
        Returns: Json
      }
      get_user_overview: { Args: never; Returns: Json }
      get_weekday_heatmap: {
        Args: {
          end_date: string
          input_account_ids?: number[]
          input_category_ids?: number[]
          input_excluded_tag_ids?: number[]
          input_group_ids?: number[]
          start_date: string
        }
        Returns: Json
      }
      is_transaction_reconciled: {
        Args: { transaction_id: number }
        Returns: boolean
      }
      merge_transactions:
        | {
            Args: {
              p_loser_id: number
              p_match_candidate_id: number
              p_resolved_fields: Json
              p_winner_id: number
            }
            Returns: undefined
          }
        | {
            Args: {
              p_loser_id: number
              p_match_candidate_id: number
              p_resolved_fields: Json
              p_split_source?: string
              p_winner_id: number
            }
            Returns: undefined
          }
      remove_transaction_from_all_reconciliations: {
        Args: { p_transaction_id: number }
        Returns: Json
      }
      remove_transaction_from_reconciliation: {
        Args: { p_reconciliation_id: number; p_transaction_id: number }
        Returns: Json
      }
      reveal_and_clear_api_key: { Args: never; Returns: string }
      rotate_api_key: { Args: never; Returns: string }
      save_insight_run: {
        Args: { p_content: string; p_model?: string; p_month: string }
        Returns: Json
      }
      set_analysis_state: {
        Args: { p_month: string; p_state: Json }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      soft_delete_reconciliation: {
        Args: { p_reconciliation_id: number }
        Returns: Json
      }
      update_transaction_with_splits: {
        Args: { p_splits: Json; p_transaction: Json; p_transaction_id: number }
        Returns: Json
      }
    }
    Enums: {
      transaction_type:
        | "expense"
        | "income"
        | "transfer"
        | "payment"
        | "transaction"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      transaction_type: [
        "expense",
        "income",
        "transfer",
        "payment",
        "transaction",
      ],
    },
  },
} as const

