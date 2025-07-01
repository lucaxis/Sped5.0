import { createClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"

// Criando um singleton para o cliente Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Verificar se as variáveis de ambiente estão definidas
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Variáveis de ambiente do Supabase não estão definidas")
}

// Configurações otimizadas para suportar múltiplos usuários e conexões
const options = {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    timeout: 60000, // Aumentar timeout para conexões realtime
    params: {
      eventsPerSecond: 10, // Aumentar limite de eventos por segundo
    },
  },
  global: {
    headers: {
      "X-Client-Info": "sped-management-app",
    },
  },
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, options)

// Função para verificar a saúde da conexão
export async function checkConnection() {
  try {
    const { data, error } = await supabase.from("empresas").select("id").limit(1)
    if (error) throw error
    return { ok: true, message: "Conexão com Supabase estabelecida com sucesso" }
  } catch (error) {
    console.error("Erro ao verificar conexão com Supabase:", error)
    return { ok: false, message: "Falha na conexão com Supabase", error }
  }
}
