import { supabase } from "./supabase"
import type { Empresa, EmpresaInsert, EmpresaUpdate, LogAtividadeInsert } from "./database.types"

// Cache para minimizar requisições repetidas
let empresasCache: Empresa[] | null = null
let lastFetchTime = 0
const CACHE_TTL = 10000 // 10 segundos

// Função para buscar todas as empresas com cache inteligente
export async function getEmpresas(forceRefresh = false) {
  const now = Date.now()

  // Usar cache se disponível e não expirado, a menos que forceRefresh seja true
  if (!forceRefresh && empresasCache && now - lastFetchTime < CACHE_TTL) {
    return empresasCache
  }

  try {
    const { data, error } = await supabase
      .from("empresas")
      .select("*")
      .order("status", { ascending: false })
      .order("data_liberacao", { ascending: true, nullsLast: true })

    if (error) {
      console.error("Erro ao buscar empresas:", error)
      throw error
    }

    // Atualizar cache
    empresasCache = data || []
    lastFetchTime = now

    return empresasCache
  } catch (error) {
    console.error("Erro ao buscar empresas:", error)
    // Se houver erro mas tivermos cache, retornar o cache mesmo expirado
    if (empresasCache) {
      return empresasCache
    }
    throw error
  }
}

// Função para invalidar o cache
export function invalidateCache() {
  empresasCache = null
}

// Função para buscar uma empresa por ID
export async function getEmpresaById(id: number) {
  // Tentar buscar do cache primeiro
  if (empresasCache) {
    const cachedEmpresa = empresasCache.find((e) => e.id === id)
    if (cachedEmpresa) return cachedEmpresa
  }

  const { data, error } = await supabase.from("empresas").select("*").eq("id", id).single()

  if (error) {
    console.error(`Erro ao buscar empresa com ID ${id}:`, error)
    throw error
  }

  return data
}

// Função para criar uma nova empresa
export async function createEmpresa(empresa: EmpresaInsert, usuarioId: string) {
  const { data, error } = await supabase.from("empresas").insert(empresa).select()

  if (error) {
    console.error("Erro ao criar empresa:", error)
    throw error
  }

  // Registrar atividade
  if (data && data[0]) {
    await registrarAtividade({
      usuario_id: usuarioId,
      empresa_id: data[0].id,
      acao: "criar",
      detalhes: `Empresa ${empresa.nome} criada`,
    })
  }

  // Invalidar cache após modificação
  invalidateCache()

  return data && data[0]
}

// Função para atualizar uma empresa
export async function updateEmpresa(id: number, updates: EmpresaUpdate, usuarioId: string) {
  const { data, error } = await supabase.from("empresas").update(updates).eq("id", id).select()

  if (error) {
    console.error(`Erro ao atualizar empresa com ID ${id}:`, error)
    throw error
  }

  // Registrar atividade
  if (data && data[0]) {
    await registrarAtividade({
      usuario_id: usuarioId,
      empresa_id: id,
      acao: "atualizar",
      detalhes: `Empresa ${data[0].nome} atualizada`,
    })
  }

  // Invalidar cache após modificação
  invalidateCache()

  return data && data[0]
}

// Função para liberar uma empresa
export async function liberarEmpresa(id: number, dataLiberacao: string, usuarioId: string) {
  try {
    const { data, error } = await supabase
      .from("empresas")
      .update({
        status: "Liberada",
        data_liberacao: dataLiberacao,
        progresso: "Gerar",
      })
      .eq("id", id)
      .select()

    if (error) {
      console.error(`Erro ao liberar empresa com ID ${id}:`, error)
      throw error
    }

    // Registrar atividade
    if (data && data[0]) {
      await registrarAtividade({
        usuario_id: usuarioId,
        empresa_id: id,
        acao: "liberar",
        detalhes: `Empresa ${data[0].nome} liberada em ${dataLiberacao}`,
      })
    }

    // Invalidar cache após modificação
    invalidateCache()

    return data && data[0]
  } catch (error) {
    console.error(`Erro ao liberar empresa com ID ${id}:`, error)
    throw error
  }
}

// Função para iniciar geração
export async function iniciarGeracao(id: number, gerador: string, usuarioId: string) {
  const { data, error } = await supabase
    .from("empresas")
    .update({
      progresso: "Em Andamento",
      gerador: gerador,
    })
    .eq("id", id)
    .select()

  if (error) {
    console.error(`Erro ao iniciar geração para empresa com ID ${id}:`, error)
    throw error
  }

  // Registrar atividade
  if (data && data[0]) {
    await registrarAtividade({
      usuario_id: usuarioId,
      empresa_id: id,
      acao: "iniciar_geracao",
      detalhes: `Geração iniciada para empresa ${data[0].nome} por ${gerador}`,
    })
  }

  // Invalidar cache após modificação
  invalidateCache()

  return data && data[0]
}

// Função para marcar como concluído
export async function marcarConcluido(id: number, usuarioId: string) {
  const { data, error } = await supabase
    .from("empresas")
    .update({
      status: "Concluída",
      progresso: "Gerado",
      enviada: "Sim",
    })
    .eq("id", id)
    .select()

  if (error) {
    console.error(`Erro ao marcar como concluído empresa com ID ${id}:`, error)
    throw error
  }

  // Registrar atividade
  if (data && data[0]) {
    await registrarAtividade({
      usuario_id: usuarioId,
      empresa_id: id,
      acao: "concluir",
      detalhes: `Empresa ${data[0].nome} marcada como concluída`,
    })
  }

  // Invalidar cache após modificação
  invalidateCache()

  return data && data[0]
}

// Função para alternar status de enviada
export async function alternarEnviada(id: number, novoStatus: "Sim" | "Não", usuarioId: string) {
  const { data, error } = await supabase
    .from("empresas")
    .update({
      enviada: novoStatus,
    })
    .eq("id", id)
    .select()

  if (error) {
    console.error(`Erro ao alternar status de enviada para empresa com ID ${id}:`, error)
    throw error
  }

  // Registrar atividade
  if (data && data[0]) {
    await registrarAtividade({
      usuario_id: usuarioId,
      empresa_id: id,
      acao: "alternar_enviada",
      detalhes: `Status de enviada alterado para ${novoStatus} na empresa ${data[0].nome}`,
    })
  }

  // Invalidar cache após modificação
  invalidateCache()

  return data && data[0]
}

// Função para resetar todas as empresas
export async function resetarEmpresas(usuarioId: string) {
  // Primeiro, vamos buscar todas as empresas para garantir que todas sejam resetadas
  const { data: empresas, error: fetchError } = await supabase.from("empresas").select("id")

  if (fetchError) {
    console.error("Erro ao buscar empresas para resetar:", fetchError)
    throw fetchError
  }

  if (!empresas || empresas.length === 0) {
    return [] // Não há empresas para resetar
  }

  // Agora vamos atualizar todas as empresas
  const { data, error } = await supabase
    .from("empresas")
    .update({
      status: "Não Liberada",
      data_liberacao: null,
      progresso: "-",
      gerador: null,
      enviada: "Não",
    })
    .in(
      "id",
      empresas.map((e) => e.id),
    )
    .select()

  if (error) {
    console.error("Erro ao resetar empresas:", error)
    throw error
  }

  // Registrar atividade
  await registrarAtividade({
    usuario_id: usuarioId,
    acao: "resetar_tudo",
    detalhes: `Todas as empresas foram resetadas (${empresas.length} empresas)`,
  })

  // Invalidar cache após modificação
  invalidateCache()

  return data
}

// Função para registrar atividade
export async function registrarAtividade(log: LogAtividadeInsert) {
  const { error } = await supabase.from("logs_atividades").insert(log)

  if (error) {
    console.error("Erro ao registrar atividade:", error)
  }
}

// Função para configurar assinatura em tempo real com reconexão automática
export function subscribeToEmpresas(callback: (empresa: Empresa) => void) {
  let channel = setupSupabaseSubscription(callback); // Helper to set up the subscription

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      console.log('Tab became visible, attempting to re-establish real-time connection...');
      // Unsubscribe from any old channel before creating a new one
      if (channel) {
        channel.unsubscribe();
      }
      channel = setupSupabaseSubscription(callback);
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Existing reconnection logic for online/offline
  const handleReconnect = () => {
    if (navigator.onLine) {
      console.log("Browser back online, attempting to re-establish real-time connection...");
      if (channel) {
        channel.unsubscribe();
      }
      channel = setupSupabaseSubscription(callback);
    }
  };
  window.addEventListener("online", handleReconnect);
  window.addEventListener("offline", () => {
    console.log("Browser offline, real-time connection likely lost.");
  });

  return {
    unsubscribe: () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener("online", handleReconnect);
      window.removeEventListener("offline", () => {}); // Remove dummy handler
      if (channel) {
        channel.unsubscribe();
      }
    },
  };
}

// Helper function to encapsulate subscription logic
function setupSupabaseSubscription(callback: (empresa: Empresa) => void) {
  return supabase
    .channel("empresas-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "empresas" }, (payload) => {
      invalidateCache();
      callback(payload.new as Empresa);
    })
    .subscribe((status) => {
      if (status !== "SUBSCRIBED") {
        console.log("Status da assinatura:", status);
      }
    });
}
  
}
