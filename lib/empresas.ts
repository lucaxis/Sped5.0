import { supabase } from "./supabase"
import type { Empresa, LogAtividadeInsert } from "./database.types"

// Cache local para empresas
let empresasCache: Empresa[] = []
let lastCacheUpdate: Date | null = null
const CACHE_DURATION = 30000 // 30 segundos

// Função para obter empresas com cache inteligente
export async function getEmpresas(forceRefresh = false): Promise<Empresa[]> {
  try {
    // Verificar se deve usar cache
    if (!forceRefresh && empresasCache.length > 0 && lastCacheUpdate) {
      const timeSinceUpdate = Date.now() - lastCacheUpdate.getTime()
      if (timeSinceUpdate < CACHE_DURATION) {
        return empresasCache
      }
    }

    const { data, error } = await supabase.from("empresas").select("*").order("id", { ascending: true })

    if (error) {
      console.error("Erro ao buscar empresas:", error)
      // Retornar cache se disponível em caso de erro
      if (empresasCache.length > 0) {
        return empresasCache
      }
      throw error
    }

    // Atualizar cache
    empresasCache = data || []
    lastCacheUpdate = new Date()

    return data || []
  } catch (error) {
    console.error("Erro ao carregar empresas:", error)
    // Retornar cache se disponível
    if (empresasCache.length > 0) {
      return empresasCache
    }
    return []
  }
}

// Função para criar nova empresa
export async function createEmpresa(empresa: any, userId: string): Promise<void> {
  const { error } = await supabase.from("empresas").insert([
    {
      ...empresa,
      created_by: userId,
      updated_at: new Date().toISOString(),
    },
  ])

  if (error) {
    console.error("Erro ao criar empresa:", error)
    throw error
  }

  // Invalidar cache
  lastCacheUpdate = null
}

// Função para atualizar empresa
export async function updateEmpresa(id: number, updates: Partial<Empresa>, userId: string): Promise<void> {
  const { error } = await supabase
    .from("empresas")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)

  if (error) {
    console.error("Erro ao atualizar empresa:", error)
    throw error
  }

  // Invalidar cache
  lastCacheUpdate = null
}

// Função para liberar empresa
export async function liberarEmpresa(id: number, dataLiberacao: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("empresas")
    .update({
      status: "Liberada",
      data_liberacao: dataLiberacao,
      progresso: "Gerar",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)

  if (error) {
    console.error("Erro ao liberar empresa:", error)
    throw error
  }

  // Invalidar cache
  lastCacheUpdate = null
}

// Função para iniciar geração
export async function iniciarGeracao(id: number, gerador: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("empresas")
    .update({
      progresso: "Em Andamento",
      gerador: gerador,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)

  if (error) {
    console.error("Erro ao iniciar geração:", error)
    throw error
  }

  // Invalidar cache
  lastCacheUpdate = null
}

// Função para marcar como concluído
export async function marcarConcluido(id: number, userId: string): Promise<void> {
  const { error } = await supabase
    .from("empresas")
    .update({
      status: "Concluída",
      progresso: "Gerado",
      enviada: "Sim",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)

  if (error) {
    console.error("Erro ao marcar como concluído:", error)
    throw error
  }

  // Invalidar cache
  lastCacheUpdate = null
}

// Função para alternar status de enviada
export async function alternarEnviada(id: number, novoStatus: "Sim" | "Não", userId: string): Promise<void> {
  const { error } = await supabase
    .from("empresas")
    .update({
      enviada: novoStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)

  if (error) {
    console.error("Erro ao alternar enviada:", error)
    throw error
  }

  // Invalidar cache
  lastCacheUpdate = null
}

// Função para resetar empresas
export async function resetarEmpresas(userId: string): Promise<void> {
  const { error } = await supabase
    .from("empresas")
    .update({
      status: "Não Liberada",
      data_liberacao: null,
      progresso: "-",
      gerador: null,
      enviada: "Não",
      updated_at: new Date().toISOString(),
    })
    .neq("id", 0) // Atualizar todos os registros

  if (error) {
    console.error("Erro ao resetar empresas:", error)
    throw error
  }

  // Invalidar cache
  lastCacheUpdate = null
}

// Função para forçar refresh dos dados
export async function forceRefresh(): Promise<Empresa[]> {
  lastCacheUpdate = null
  return await getEmpresas(true)
}

// Função para verificar conexão com banco
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const { error } = await supabase.from("empresas").select("count").limit(1).single()

    return !error || error.code === "PGRST116"
  } catch (error) {
    console.error("Erro ao verificar conexão com banco:", error)
    return false
  }
}

// Função para configurar WebSocket com reconexão automática
export function subscribeToEmpresas(callback: (empresa: Empresa) => void) {
  // ---- Fallback de polling ----
  const POLLING_MS = 10_000 // 10 s
  let pollingTimer: NodeJS.Timeout | null = null

  let subscription: any = null
  let reconnectAttempts = 0
  const MAX_RECONNECT = 8 // número maior de tentativas
  let reconnectTimeout: NodeJS.Timeout | null = null

  let inFallback = false // indica se estamos em modo polling

  const connect = () => {
    try {
      subscription = supabase
        .channel("empresas-changes")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "empresas",
          },
          (payload) => {
            console.log("Mudança recebida:", payload)

            if (payload.new && typeof payload.new === "object") {
              callback(payload.new as Empresa)
              // Invalidar cache quando houver mudanças
              lastCacheUpdate = null
            }
          },
        )
        .subscribe((status) => {
          console.log("Status da assinatura:", status)

          if (status === "SUBSCRIBED") {
            reconnectAttempts = 0 // zerar contador
            stopPolling() // se estava em polling, cancela
            inFallback = false
            console.log("✅ Realtime reconectado")
          } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
            if (inFallback) return // já estamos em polling, ignora

            console.warn("⚠️ Realtime perdido, tentativa de reconexão…")

            if (reconnectAttempts < MAX_RECONNECT) {
              reconnectAttempts++
              const delay = Math.min(1000 * 2 ** reconnectAttempts, 30_000)

              reconnectTimeout = setTimeout(() => {
                console.log(`Tentativa ${reconnectAttempts}/${MAX_RECONNECT}`)
                subscription?.unsubscribe()
                connect()
              }, delay)
            } else {
              console.error("❌ Máximo de tentativas atingido — iniciando fallback de polling")
              inFallback = true
              startPolling()
            }
          }
        })
    } catch (error) {
      console.error("Erro ao configurar subscription:", error)
    }
  }

  // ---------------- Polling ----------------
  async function pollOnce() {
    try {
      const { data, error } = await supabase
        .from("empresas")
        .select("updated_at") // consulta leve
        .order("updated_at", { ascending: false })
        .limit(1)

      if (!error && data) {
        // Detectou que o backend responde → tentar restabelecer o websocket
        if (pollingTimer) {
          stopPolling()
          console.log("🎉 Backend responde — voltando ao realtime")
          connect()
        }
      }
    } catch (err) {
      console.error("Polling error:", err)
    }
  }

  function startPolling() {
    if (pollingTimer) return
    pollingTimer = setInterval(pollOnce, POLLING_MS)

    // enquanto em polling, tente recriar o canal a cada 30 s
    setTimeout(() => {
      if (inFallback) {
        console.log("🔄 Tentando restabelecer WebSocket…")
        reconnectAttempts = 0
        subscription?.unsubscribe()
        connect()
      }
    }, 30_000)
  }

  function stopPolling() {
    if (pollingTimer) {
      clearInterval(pollingTimer)
      pollingTimer = null
    }
  }

  // Iniciar conexão
  connect()

  // Retornar função de cleanup
  return {
    unsubscribe: () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      stopPolling() // <- novo
      subscription?.unsubscribe()
    },
    getConnectionStatus: () => {
      return subscription?.state === "joined"
    },
    forceClearCacheAndRefresh: async () => {
      lastCacheUpdate = null
      return await getEmpresas(true)
    },
  }
}

// -------------------------------------------------------------
// Registrar atividade no Supabase (log de auditoria)
export async function registrarAtividade(log: LogAtividadeInsert): Promise<void> {
  try {
    const { error } = await supabase.from("logs_atividades").insert(log)
    if (error) {
      // Apenas logar, não quebrar o fluxo principal
      console.error("Erro ao registrar atividade:", error)
    }
  } catch (err) {
    console.error("Erro inesperado ao registrar atividade:", err)
  }
}

// Função para configurar WebSocket client (compatibilidade)
export function setupWebSocketClient(callback: (empresa: Empresa) => void) {
  return subscribeToEmpresas(callback)
}
