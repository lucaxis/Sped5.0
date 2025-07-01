"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PlusCircle, Edit, Save, X, Loader2, ArrowLeft, RefreshCw } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { Header } from "@/components/header"
import { useRouter } from "next/navigation"
import {
  getEmpresas,
  createEmpresa,
  updateEmpresa,
  liberarEmpresa as liberar,
  iniciarGeracao as iniciar,
  marcarConcluido as concluir,
  alternarEnviada as alternar,
  resetarEmpresas,
  subscribeToEmpresas,
} from "@/lib/empresas"
import { checkConnection } from "@/lib/supabase"
import type { Empresa as EmpresaType } from "@/lib/database.types"

export default function SpedManagementSystem() {
  // Estado para armazenar os dados das empresas
  const [empresas, setEmpresas] = useState<EmpresaType[]>([])
  // Estado para controlar o diálogo de geração
  const [dialogOpen, setDialogOpen] = useState(false)
  // Estado para armazenar a empresa selecionada para geração
  const [selectedEmpresa, setSelectedEmpresa] = useState<EmpresaType | null>(null)
  // Estado para armazenar o nome do gerador
  const [nomeGerador, setNomeGerador] = useState("")

  // Estados para pesquisa e filtro
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("Todos")
  const [empresasFiltradas, setEmpresasFiltradas] = useState<EmpresaType[]>([])
  const [contadores, setContadores] = useState({
    total: 0,
    liberadas: 0,
    naoLiberadas: 0,
    geradas: 0,
    enviadas: 0,
  })

  // Estados para cadastro e edição de empresas
  const [showNovaEmpresa, setShowNovaEmpresa] = useState(false)
  const [showEditarEmpresa, setShowEditarEmpresa] = useState(false)
  const [novaEmpresa, setNovaEmpresa] = useState({
    nome: "",
    armazenamento: "Nuvem",
    informacoes_sped: "",
    nome_base: "",
    status: "Não Liberada",
    data_liberacao: null,
    progresso: "-",
    gerador: null,
    enviada: "Não",
    anotacoes: "",
  })
  const [empresaParaEditar, setEmpresaParaEditar] = useState<EmpresaType | null>(null)

  // Estado para controlar carregamento
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "checking">("checking")
  const [lastSync, setLastSync] = useState<Date | null>(null)

  // Referência para o intervalo de atualização
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null)

  // Autenticação e roteamento
  const { user, isLoading } = useAuth()
  const router = useRouter()

  // Verificar autenticação
  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login")
    }
  }, [isLoading, user, router])

  // Função para verificar a conexão
  const checkConnectionStatus = useCallback(async () => {
    setConnectionStatus("checking")
    try {
      const result = await checkConnection()
      setConnectionStatus(result.ok ? "connected" : "disconnected")
    } catch (error) {
      console.error("Erro ao verificar conexão:", error)
      setConnectionStatus("disconnected")
    }
  }, [])

  // Função para carregar empresas
  const loadEmpresas = useCallback(
    async (forceRefresh = false) => {
      if (!user) return

      try {
        setLoading(true)
        const data = await getEmpresas(forceRefresh)
        setEmpresas(data)
        setLastSync(new Date())
      } catch (error) {
        console.error("Erro ao carregar empresas:", error)
        // Tentar verificar a conexão
        checkConnectionStatus()
      } finally {
        setLoading(false)
      }
    },
    [user, checkConnectionStatus],
  )

  // Função para atualização manual
  const handleManualRefresh = useCallback(() => {
    loadEmpresas(true)
  }, [loadEmpresas])

  // Carregar dados iniciais e configurar atualizações periódicas
  useEffect(() => {
    if (!user) return

    // Carregar dados iniciais
    loadEmpresas()
    checkConnectionStatus()

    // Configurar atualização periódica (a cada 30 segundos)
    refreshIntervalRef.current = setInterval(() => {
      loadEmpresas(true)
    }, 30000)

    // Configurar assinatura em tempo real
    subscriptionRef.current = subscribeToEmpresas((updatedEmpresa) => {
      setEmpresas((prev) => {
        const index = prev.findIndex((e) => e.id === updatedEmpresa.id)
        if (index >= 0) {
          const newEmpresas = [...prev]
          newEmpresas[index] = updatedEmpresa
          return newEmpresas
        } else {
          return [...prev, updatedEmpresa]
        }
      })
      setLastSync(new Date())
    })

    // Configurar verificação de conexão online/offline
    const handleOnline = () => {
      checkConnectionStatus()
      loadEmpresas(true)
    }

    const handleOffline = () => {
      setConnectionStatus("disconnected")
    }

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      // Limpar intervalo e assinatura ao desmontar
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
      }

      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe()
      }

      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [user, loadEmpresas, checkConnectionStatus])

  // Filtrar empresas e atualizar contadores
  useEffect(() => {
    // Aplicar filtros
    let resultado = empresas

    // Aplicar filtro de pesquisa
    if (searchTerm) {
      resultado = resultado.filter((empresa) => empresa.nome.toLowerCase().includes(searchTerm.toLowerCase()))
    }

    // Aplicar filtro de status
    if (statusFilter !== "Todos") {
      if (statusFilter === "Liberadas") {
        resultado = resultado.filter((empresa) => empresa.status === "Liberada")
      } else if (statusFilter === "Não Liberadas") {
        resultado = resultado.filter((empresa) => empresa.status === "Não Liberada")
      } else if (statusFilter === "Geradas") {
        resultado = resultado.filter(
          (empresa) => empresa.progresso === "Gerado" || empresa.progresso === "Em Andamento",
        )
      } else if (statusFilter === "Enviadas") {
        resultado = resultado.filter((empresa) => empresa.enviada === "Sim")
      }
    }

    setEmpresasFiltradas(resultado)

    // Atualizar contadores
    setContadores({
      total: empresas.length,
      liberadas: empresas.filter((e) => e.status === "Liberada").length,
      naoLiberadas: empresas.filter((e) => e.status === "Não Liberada").length,
      geradas: empresas.filter((e) => e.progresso === "Gerado" || e.progresso === "Em Andamento").length,
      enviadas: empresas.filter((e) => e.enviada === "Sim").length,
    })
  }, [empresas, searchTerm, statusFilter])

  // Função para liberar uma empresa
  const liberarEmpresa = async (id: number) => {
    if (!user) return

    try {
      setActionLoading(true)
      const dataHoraAtual = format(new Date(), "yyyy-MM-dd HH:mm:ss", { locale: ptBR })

      // Atualizar o estado local imediatamente para feedback visual
      setEmpresas((prev) =>
        prev.map((empresa) => {
          if (empresa.id === id) {
            return {
              ...empresa,
              status: "Liberada",
              data_liberacao: dataHoraAtual,
              progresso: "Gerar",
            }
          }
          return empresa
        }),
      )

      // Chamar a API para persistir a mudança
      await liberar(id, dataHoraAtual, user.id)

      // Atualizar última sincronização
      setLastSync(new Date())
    } catch (error) {
      console.error("Erro ao liberar empresa:", error)
      // Recarregar dados em caso de erro para garantir consistência
      loadEmpresas(true)
      alert("Ocorreu um erro ao liberar a empresa. Os dados foram recarregados.")
    } finally {
      setActionLoading(false)
    }
  }

  // Função para alternar o status de enviada
  const alternarEnviada = async (id: number, statusAtual: string) => {
    if (!user) return

    try {
      setActionLoading(true)
      const novoStatus = statusAtual === "Sim" ? "Não" : "Sim"

      // Atualizar o estado local imediatamente para feedback visual
      setEmpresas((prev) =>
        prev.map((empresa) => {
          if (empresa.id === id) {
            return {
              ...empresa,
              enviada: novoStatus,
            }
          }
          return empresa
        }),
      )

      await alternar(id, novoStatus as "Sim" | "Não", user.id)
      setLastSync(new Date())
    } catch (error) {
      console.error("Erro ao alternar status de enviada:", error)
      loadEmpresas(true)
    } finally {
      setActionLoading(false)
    }
  }

  // Função para iniciar o processo de geração
  const iniciarGeracao = (empresa: EmpresaType) => {
    setSelectedEmpresa(empresa)
    setNomeGerador("")
    setDialogOpen(true)
  }

  // Função para confirmar a geração
  const confirmarGeracao = async () => {
    if (!selectedEmpresa || !nomeGerador.trim() || !user) return

    try {
      setActionLoading(true)

      // Atualizar o estado local imediatamente para feedback visual
      setEmpresas((prev) =>
        prev.map((empresa) => {
          if (empresa.id === selectedEmpresa.id) {
            return {
              ...empresa,
              progresso: "Em Andamento",
              gerador: nomeGerador.trim(),
            }
          }
          return empresa
        }),
      )

      await iniciar(selectedEmpresa.id, nomeGerador.trim(), user.id)
      setDialogOpen(false)
      setSelectedEmpresa(null)
      setLastSync(new Date())
    } catch (error) {
      console.error("Erro ao iniciar geração:", error)
      loadEmpresas(true)
    } finally {
      setActionLoading(false)
    }
  }

  // Função para marcar como concluído
  const marcarConcluido = async (id: number) => {
    if (!user) return

    try {
      setActionLoading(true)

      // Atualizar o estado local imediatamente para feedback visual
      setEmpresas((prev) =>
        prev.map((empresa) => {
          if (empresa.id === id) {
            return {
              ...empresa,
              status: "Concluída",
              progresso: "Gerado",
              enviada: "Sim",
            }
          }
          return empresa
        }),
      )

      await concluir(id, user.id)
      setLastSync(new Date())
    } catch (error) {
      console.error("Erro ao marcar como concluído:", error)
      loadEmpresas(true)
    } finally {
      setActionLoading(false)
    }
  }

  // Função para resetar todos os dados
  const resetarTudo = async () => {
    if (!user) return

    if (window.confirm("Tem certeza que deseja resetar todos os dados? Esta ação não pode ser desfeita.")) {
      try {
        setActionLoading(true)
        await resetarEmpresas(user.id)

        // Recarregar dados após resetar
        await loadEmpresas(true)

        // Mostrar mensagem de sucesso
        alert("Todas as empresas foram resetadas com sucesso!")

        // Resetar filtros para mostrar todas as empresas
        setStatusFilter("Todos")
        setSearchTerm("")
        setLastSync(new Date())
      } catch (error) {
        console.error("Erro ao resetar dados:", error)
        alert("Ocorreu um erro ao resetar os dados. Por favor, tente novamente.")
        loadEmpresas(true)
      } finally {
        setActionLoading(false)
      }
    }
  }

  // Função para adicionar nova empresa
  const adicionarEmpresa = async () => {
    if (!user) return

    if (!novaEmpresa.nome.trim()) {
      alert("O nome da empresa é obrigatório!")
      return
    }

    try {
      setActionLoading(true)
      await createEmpresa(novaEmpresa, user.id)

      // Recarregar dados após adicionar
      await loadEmpresas(true)

      // Resetar o formulário
      setNovaEmpresa({
        nome: "",
        armazenamento: "Nuvem",
        informacoes_sped: "",
        nome_base: "",
        status: "Não Liberada",
        data_liberacao: null,
        progresso: "-",
        gerador: null,
        enviada: "Não",
        anotacoes: "",
      })

      setShowNovaEmpresa(false)
      setLastSync(new Date())
    } catch (error) {
      console.error("Erro ao adicionar empresa:", error)
      alert("Ocorreu um erro ao adicionar a empresa. Por favor, tente novamente.")
    } finally {
      setActionLoading(false)
    }
  }

  // Função para iniciar edição de empresa
  const iniciarEdicao = (empresa: EmpresaType) => {
    setEmpresaParaEditar({ ...empresa })
    setShowEditarEmpresa(true)
  }

  // Função para salvar edição de empresa
  const salvarEdicao = async () => {
    if (!empresaParaEditar || !user) return

    try {
      setActionLoading(true)
      await updateEmpresa(empresaParaEditar.id, empresaParaEditar, user.id)

      // Atualizar o estado local imediatamente
      setEmpresas((prev) =>
        prev.map((empresa) => {
          if (empresa.id === empresaParaEditar.id) {
            return empresaParaEditar
          }
          return empresa
        }),
      )

      setShowEditarEmpresa(false)
      setEmpresaParaEditar(null)
      setLastSync(new Date())
    } catch (error) {
      console.error("Erro ao salvar edição:", error)
      alert("Ocorreu um erro ao salvar as alterações. Por favor, tente novamente.")
      loadEmpresas(true)
    } finally {
      setActionLoading(false)
    }
  }

  // Se estiver carregando ou não estiver autenticado, mostrar tela de carregamento
  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div
      className="min-h-screen bg-fixed bg-center bg-no-repeat bg-cover"
      style={{ backgroundImage: 'url("/images/sped-background.png")' }}
    >
      <div className="container mx-auto py-6 bg-white/80 min-h-screen backdrop-blur-sm">
        <Header />

        {/* Status de conexão e sincronização */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${connectionStatus === "connected" ? "bg-green-500" : connectionStatus === "checking" ? "bg-yellow-500" : "bg-red-500"}`}
            ></div>
            <span className="text-sm">
              {connectionStatus === "connected"
                ? "Conectado"
                : connectionStatus === "checking"
                  ? "Verificando conexão..."
                  : "Desconectado"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm">
              {lastSync ? `Última sincronização: ${lastSync.toLocaleTimeString()}` : "Aguardando sincronização..."}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualRefresh}
              disabled={loading || connectionStatus !== "connected"}
              className="flex items-center gap-1"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>

        {/* Seção de cadastro de nova empresa */}
        {showNovaEmpresa ? (
          <Card className="mb-6 card-container">
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                <span>Cadastrar Nova Empresa</span>
                <Button variant="ghost" size="icon" onClick={() => setShowNovaEmpresa(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome da Empresa*</Label>
                  <Input
                    id="nome"
                    value={novaEmpresa.nome}
                    onChange={(e) => setNovaEmpresa({ ...novaEmpresa, nome: e.target.value })}
                    placeholder="Nome da empresa"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="armazenamento">Armazenamento</Label>
                  <Select
                    value={novaEmpresa.armazenamento}
                    onValueChange={(value) => setNovaEmpresa({ ...novaEmpresa, armazenamento: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo de armazenamento" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Nuvem">Nuvem</SelectItem>
                      <SelectItem value="Local">Local</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="informacoesSped">Informações do SPED</Label>
                  <Input
                    id="informacoesSped"
                    value={novaEmpresa.informacoes_sped}
                    onChange={(e) => setNovaEmpresa({ ...novaEmpresa, informacoes_sped: e.target.value })}
                    placeholder="Informações adicionais"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nomeBase">Nome da Base</Label>
                  <Input
                    id="nomeBase"
                    value={novaEmpresa.nome_base || ""}
                    onChange={(e) => setNovaEmpresa({ ...novaEmpresa, nome_base: e.target.value })}
                    placeholder="Nome da base de dados"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="anotacoes">Anotações</Label>
                  <Input
                    id="anotacoes"
                    value={novaEmpresa.anotacoes}
                    onChange={(e) => setNovaEmpresa({ ...novaEmpresa, anotacoes: e.target.value })}
                    placeholder="Anotações"
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button onClick={adicionarEmpresa} disabled={actionLoading}>
                  {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Cadastrar Empresa
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="flex gap-2 mb-6">
            <Button onClick={() => setShowNovaEmpresa(true)}>
              <PlusCircle className="mr-2 h-4 w-4" /> Cadastrar Nova Empresa
            </Button>
            <Button variant="outline" onClick={() => router.push("/importar")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Importar Empresas
            </Button>
          </div>
        )}

        {/* Seção de edição de empresa */}
        {showEditarEmpresa && empresaParaEditar && (
          <Card className="mb-6 card-container">
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                <span>Editar Empresa: {empresaParaEditar.nome}</span>
                <Button variant="ghost" size="icon" onClick={() => setShowEditarEmpresa(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-nome">Nome da Empresa*</Label>
                  <Input
                    id="edit-nome"
                    value={empresaParaEditar.nome}
                    onChange={(e) => setEmpresaParaEditar({ ...empresaParaEditar, nome: e.target.value })}
                    placeholder="Nome da empresa"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-armazenamento">Armazenamento</Label>
                  <Select
                    value={empresaParaEditar.armazenamento}
                    onValueChange={(value) => setEmpresaParaEditar({ ...empresaParaEditar, armazenamento: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo de armazenamento" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Nuvem">Nuvem</SelectItem>
                      <SelectItem value="Local">Local</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-informacoesSped">Informações do SPED</Label>
                  <Input
                    id="edit-informacoesSped"
                    value={empresaParaEditar.informacoes_sped || ""}
                    onChange={(e) => setEmpresaParaEditar({ ...empresaParaEditar, informacoes_sped: e.target.value })}
                    placeholder="Informações adicionais"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-nomeBase">Nome da Base</Label>
                  <Input
                    id="edit-nomeBase"
                    value={empresaParaEditar.nome_base || ""}
                    onChange={(e) => setEmpresaParaEditar({ ...empresaParaEditar, nome_base: e.target.value })}
                    placeholder="Nome da base de dados"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-anotacoes">Anotações</Label>
                  <Input
                    id="edit-anotacoes"
                    value={empresaParaEditar.anotacoes || ""}
                    onChange={(e) => setEmpresaParaEditar({ ...empresaParaEditar, anotacoes: e.target.value })}
                    placeholder="Anotações"
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button onClick={salvarEdicao} disabled={actionLoading}>
                  {actionLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Salvar Alterações
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="mb-6 space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                type="search"
                placeholder="Pesquisar empresas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full"
              />
            </div>
            <div className="flex flex-col md:flex-row gap-2">
              <select
                className="border rounded-md px-3 py-2"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="Todos">Todos</option>
                <option value="Liberadas">Liberadas ({contadores.liberadas})</option>
                <option value="Não Liberadas">Não Liberadas ({contadores.naoLiberadas})</option>
                <option value="Geradas">Geradas ({contadores.geradas})</option>
                <option value="Enviadas">Enviadas ({contadores.enviadas})</option>
              </select>
              <Button variant="destructive" onClick={resetarTudo} disabled={actionLoading}>
                {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Resetar Tudo
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="bg-gray-100 px-3 py-1 rounded-md">
              Total: <span className="font-bold">{contadores.total}</span>
            </div>
            <div className="bg-green-100 px-3 py-1 rounded-md">
              Liberadas: <span className="font-bold">{contadores.liberadas}</span>
            </div>
            <div className="bg-red-100 px-3 py-1 rounded-md">
              Não Liberadas: <span className="font-bold">{contadores.naoLiberadas}</span>
            </div>
            <div className="bg-blue-100 px-3 py-1 rounded-md">
              Geradas: <span className="font-bold">{contadores.geradas}</span>
            </div>
            <div className="bg-yellow-100 px-3 py-1 rounded-md">
              Enviadas: <span className="font-bold">{contadores.enviadas}</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="rounded-md border table-container">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-center">#</TableHead>
                  <TableHead className="text-center">Empresa</TableHead>
                  <TableHead className="text-center">Armazenamento</TableHead>
                  <TableHead className="text-center">Informações Do Sped</TableHead>
                  <TableHead className="text-center">Nome da Base</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Data da Liberação</TableHead>
                  <TableHead className="text-center">Progresso</TableHead>
                  <TableHead className="text-center">Gerador</TableHead>
                  <TableHead className="text-center">Enviada</TableHead>
                  <TableHead className="text-center">Anotações</TableHead>
                  <TableHead className="text-center w-16">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {empresasFiltradas.map((empresa, index) => (
                  <TableRow key={empresa.id}>
                    <TableCell className="text-center">{index + 1}</TableCell>
                    <TableCell>{empresa.nome}</TableCell>
                    <TableCell>{empresa.armazenamento}</TableCell>
                    <TableCell>{empresa.informacoes_sped}</TableCell>
                    <TableCell>{empresa.nome_base}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-2">
                        <div
                          className={`text-center py-1 px-2 rounded ${
                            empresa.status === "Liberada"
                              ? "bg-green-500 text-white"
                              : empresa.status === "Concluída"
                                ? "bg-blue-500 text-white"
                                : "bg-red-500 text-white"
                          }`}
                        >
                          {empresa.status}
                        </div>
                        {empresa.status === "Não Liberada" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => liberarEmpresa(empresa.id)}
                            disabled={actionLoading}
                          >
                            {actionLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Liberar"}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {empresa.data_liberacao ? new Date(empresa.data_liberacao).toLocaleString("pt-BR") : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      {empresa.status === "Liberada" && empresa.progresso === "Gerar" ? (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => iniciarGeracao(empresa)}
                          disabled={actionLoading}
                        >
                          {actionLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Gerar"}
                        </Button>
                      ) : empresa.progresso === "Em Andamento" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => marcarConcluido(empresa.id)}
                          disabled={actionLoading}
                        >
                          {actionLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Concluir"}
                        </Button>
                      ) : (
                        empresa.progresso
                      )}
                    </TableCell>
                    <TableCell className="text-center">{empresa.gerador || "-"}</TableCell>
                    <TableCell>
                      <Button
                        variant={empresa.enviada === "Sim" ? "default" : "outline"}
                        size="sm"
                        onClick={() => alternarEnviada(empresa.id, empresa.enviada)}
                        className={`w-full ${
                          empresa.enviada === "Sim" ? "bg-green-500 hover:bg-green-600" : "bg-red-500 hover:bg-red-600"
                        } text-white`}
                        disabled={actionLoading}
                      >
                        {actionLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : empresa.enviada}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="text"
                        value={empresa.anotacoes || ""}
                        onChange={async (e) => {
                          if (!user) return
                          try {
                            await updateEmpresa(empresa.id, { anotacoes: e.target.value }, user.id)
                          } catch (error) {
                            console.error("Erro ao atualizar anotações:", error)
                          }
                        }}
                        className="h-8 min-w-[120px]"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => iniciarEdicao(empresa)}
                        disabled={actionLoading}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Diálogo para informar o nome do gerador */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Informar Gerador</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <label htmlFor="nomeGerador" className="block text-sm font-medium mb-2">
                Nome do Gerador
              </label>
              <Input
                id="nomeGerador"
                value={nomeGerador}
                onChange={(e) => setNomeGerador(e.target.value)}
                placeholder="Digite o nome do gerador"
                className="w-full"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={actionLoading}>
                Cancelar
              </Button>
              <Button onClick={confirmarGeracao} disabled={!nomeGerador.trim() || actionLoading}>
                {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Confirmar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
