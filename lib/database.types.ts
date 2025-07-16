export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      empresas: {
        Row: {
          id: number
          nome: string
          armazenamento: string
          informacoes_sped: string | null
          nome_base: string | null
          status: string
          data_liberacao: string | null
          progresso: string
          gerador: string | null
          enviada: string
          anotacoes: string | null
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: number
          nome: string
          armazenamento?: string
          informacoes_sped?: string | null
          nome_base?: string | null
          status?: string
          data_liberacao?: string | null
          progresso?: string
          gerador?: string | null
          enviada?: string
          anotacoes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: number
          nome?: string
          armazenamento?: string
          informacoes_sped?: string | null
          nome_base?: string | null
          status?: string
          data_liberacao?: string | null
          progresso?: string
          gerador?: string | null
          enviada?: string
          anotacoes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
      }
      profiles: {
        Row: {
          id: string
          nome: string | null
          email: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          nome?: string | null
          email?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nome?: string | null
          email?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Empresa = Database["public"]["Tables"]["empresas"]["Row"]
export type Profile = Database["public"]["Tables"]["profiles"]["Row"]
