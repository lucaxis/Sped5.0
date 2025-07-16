import { createClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("⚠️ Variáveis de ambiente do Supabase não estão definidas. Usando cliente mock para desenvolvimento.")
}

// Criar cliente Supabase com configurações otimizadas
export const supabase = createClient<Database>(supabaseUrl || "http://localhost:54321", supabaseAnonKey || "mock-key", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
  global: {
    headers: {
      "x-my-custom-header": "sped-management",
    },
  },
})

// Função para verificar conexão
export async function checkConnection() {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return { ok: false, error: "Variáveis de ambiente não configuradas" }
    }

    const { data, error } = await supabase.from("empresas").select("count").limit(1).single()

    if (error && error.code !== "PGRST116") {
      return { ok: false, error: error.message }
    }

    return { ok: true }
  } catch (error) {
    console.error("Erro na verificação de conexão:", error)
    return { ok: false, error: "Erro de conexão" }
  }
}

// Função para reconectar o cliente Supabase
export async function reconnectSupabase(): Promise<boolean> {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn("Não é possível reconectar: variáveis de ambiente não configuradas")
      return false
    }

    // Verificar se a sessão ainda é válida
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (session) {
      // Tentar uma operação simples para verificar a conexão
      const { error } = await supabase.from("empresas").select("count").limit(1).single()

      if (!error || error.code === "PGRST116") {
        return true
      }
    }

    // Se chegou aqui, a conexão falhou
    return false
  } catch (error) {
    console.error("Erro ao reconectar Supabase:", error)
    return false
  }
}

// Função para verificar se o banco de dados está acessível
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return false
    }

    const { error } = await supabase.from("empresas").select("count").limit(1).single()

    return !error || error.code === "PGRST116"
  } catch (error) {
    console.error("Erro ao verificar conexão com banco:", error)
    return false
  }
}
