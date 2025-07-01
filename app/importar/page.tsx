"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Header } from "@/components/header"
import { Loader2, CheckCircle, AlertCircle, ArrowLeft } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { registrarAtividade } from "@/lib/empresas"
import type { Empresa } from "@/lib/database.types"

interface EmpresaCSV {
  nome: string
  armazenamento: string
  informacoes_sped: string
  nome_base: string
}

export default function ImportarEmpresas() {
  const [loading, setLoading] = useState(true)
  const [processando, setProcessando] = useState(false)
  const [empresasCSV, setEmpresasCSV] = useState<EmpresaCSV[]>([])
  const [empresasExistentes, setEmpresasExistentes] = useState<Empresa[]>([])
  const [empresasParaImportar, setEmpresasParaImportar] = useState<EmpresaCSV[]>([])
  const [empresasImportadas, setEmpresasImportadas] = useState<string[]>([])
  const [empresasIgnoradas, setEmpresasIgnoradas] = useState<string[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [concluido, setConcluido] = useState(false)

  const { user, isLoading } = useAuth()
  const router = useRouter()

  // Verificar autenticação
  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login")
    }
  }, [isLoading, user, router])

  // Carregar dados
  useEffect(() => {
    if (!user) return

    const carregarDados = async () => {
      try {
        setLoading(true)

        // Buscar empresas existentes
        const { data: empresas, error } = await supabase.from("empresas").select("*")
        if (error) throw error

        setEmpresasExistentes(empresas || [])

        // Buscar arquivo CSV - usando a nova URL fornecida
        const response = await fetch(
          "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Empresass-4XwB5f1yUioLpkDKPXulc40NhWtPKs.csv",
        )
        if (!response.ok) throw new Error("Erro ao buscar arquivo CSV")

        const csvText = await response.text()
        const empresasDoCSV = processarCSV(csvText)
        setEmpresasCSV(empresasDoCSV)

        // Filtrar empresas para importar (remover duplicatas e já existentes)
        const empresasUnicas = filtrarEmpresasUnicas(empresasDoCSV)
        const paraImportar = filtrarEmpresasNovas(empresasUnicas, empresas || [])
        setEmpresasParaImportar(paraImportar)
      } catch (error) {
        console.error("Erro ao carregar dados:", error)
        setErro("Erro ao carregar dados. Por favor, tente novamente.")
      } finally {
        setLoading(false)
      }
    }

    carregarDados()
  }, [user])

  // Processar arquivo CSV
  const processarCSV = (csvText: string): EmpresaCSV[] => {
    const linhas = csvText.split("\n")
    const empresas: EmpresaCSV[] = []

    // Pular a primeira linha (cabeçalho)
    for (let i = 1; i < linhas.length; i++) {
      const linha = linhas[i].trim()
      if (!linha) continue

      const colunas = linha.split(";")
      if (colunas.length < 4) continue

      const nome = colunas[0].trim()
      if (!nome) continue // Ignorar linhas sem nome de empresa

      empresas.push({
        nome,
        armazenamento: colunas[1].trim() || "Nuvem", // Padrão para Nuvem se estiver vazio
        informacoes_sped: colunas[2].trim(),
        nome_base: colunas[3].trim(),
      })
    }

    return empresas
  }

  // Filtrar empresas únicas (remover duplicatas no CSV)
  const filtrarEmpresasUnicas = (empresas: EmpresaCSV[]): EmpresaCSV[] => {
    const nomesUnicos = new Set<string>()
    const empresasUnicas: EmpresaCSV[] = []

    for (const empresa of empresas) {
      if (!nomesUnicos.has(empresa.nome.toLowerCase())) {
        nomesUnicos.add(empresa.nome.toLowerCase())
        empresasUnicas.push(empresa)
      }
    }

    return empresasUnicas
  }

  // Filtrar empresas novas (não existentes no banco)
  const filtrarEmpresasNovas = (empresasCSV: EmpresaCSV[], empresasExistentes: Empresa[]): EmpresaCSV[] => {
    const nomesExistentes = new Set(empresasExistentes.map((e) => e.nome.toLowerCase()))
    return empresasCSV.filter((empresa) => !nomesExistentes.has(empresa.nome.toLowerCase()))
  }

  // Importar empresas
  const importarEmpresas = async () => {
    if (!user || empresasParaImportar.length === 0) return

    try {
      setProcessando(true)
      setErro(null)
      setEmpresasImportadas([])
      setEmpresasIgnoradas([])

      const importadas: string[] = []
      const ignoradas: string[] = []

      // Importar cada empresa
      for (const empresa of empresasParaImportar) {
        try {
          const { error } = await supabase.from("empresas").insert({
            nome: empresa.nome,
            armazenamento: empresa.armazenamento || "Nuvem",
            informacoes_sped: empresa.informacoes_sped || null,
            nome_base: empresa.nome_base || null,
            status: "Não Liberada",
            progresso: "-",
            enviada: "Não",
          })

          if (error) {
            console.error(`Erro ao importar empresa ${empresa.nome}:`, error)
            ignoradas.push(empresa.nome)
          } else {
            importadas.push(empresa.nome)
          }
        } catch (error) {
          console.error(`Erro ao importar empresa ${empresa.nome}:`, error)
          ignoradas.push(empresa.nome)
        }
      }

      // Registrar atividade
      await registrarAtividade({
        usuario_id: user.id,
        acao: "importar_empresas",
        detalhes: `Importação de empresas: ${importadas.length} importadas, ${ignoradas.length} ignoradas`,
      })

      setEmpresasImportadas(importadas)
      setEmpresasIgnoradas(ignoradas)
      setConcluido(true)
    } catch (error) {
      console.error("Erro ao importar empresas:", error)
      setErro("Ocorreu um erro durante a importação. Algumas empresas podem não ter sido importadas.")
    } finally {
      setProcessando(false)
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

        <div className="mb-6 flex items-center">
          <Button variant="outline" onClick={() => router.push("/")} className="mr-4">
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
          </Button>
          <h2 className="text-2xl font-bold">Importar Empresas</h2>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin mr-2" />
            <span>Carregando dados...</span>
          </div>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Resumo da Importação</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-gray-100 p-4 rounded-md">
                    <p className="text-sm text-gray-500">Total no CSV</p>
                    <p className="text-2xl font-bold">{empresasCSV.length}</p>
                  </div>
                  <div className="bg-gray-100 p-4 rounded-md">
                    <p className="text-sm text-gray-500">Já cadastradas</p>
                    <p className="text-2xl font-bold">{empresasCSV.length - empresasParaImportar.length}</p>
                  </div>
                  <div className="bg-green-100 p-4 rounded-md">
                    <p className="text-sm text-gray-500">Para importar</p>
                    <p className="text-2xl font-bold">{empresasParaImportar.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {erro && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Erro</AlertTitle>
                <AlertDescription>{erro}</AlertDescription>
              </Alert>
            )}

            {concluido && (
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <AlertTitle>Importação concluída</AlertTitle>
                <AlertDescription>
                  <p>
                    <strong>{empresasImportadas.length}</strong> empresas foram importadas com sucesso.
                    {empresasIgnoradas.length > 0 && (
                      <span>
                        {" "}
                        <strong>{empresasIgnoradas.length}</strong> empresas foram ignoradas devido a erros.
                      </span>
                    )}
                  </p>
                </AlertDescription>
              </Alert>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Empresas para Importar ({empresasParaImportar.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {empresasParaImportar.length === 0 ? (
                  <p className="text-center py-4 text-gray-500">
                    Não há novas empresas para importar. Todas as empresas do CSV já estão cadastradas.
                  </p>
                ) : (
                  <>
                    <div className="rounded-md border overflow-hidden mb-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">#</TableHead>
                            <TableHead>Empresa</TableHead>
                            <TableHead>Armazenamento</TableHead>
                            <TableHead>Informações Do Sped</TableHead>
                            <TableHead>Nome da Base</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {empresasParaImportar.map((empresa, index) => (
                            <TableRow key={index}>
                              <TableCell>{index + 1}</TableCell>
                              <TableCell>{empresa.nome}</TableCell>
                              <TableCell>{empresa.armazenamento || "Nuvem"}</TableCell>
                              <TableCell>{empresa.informacoes_sped || "-"}</TableCell>
                              <TableCell>{empresa.nome_base || "-"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="flex justify-end">
                      <Button onClick={importarEmpresas} disabled={processando || concluido}>
                        {processando ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importando...
                          </>
                        ) : concluido ? (
                          <>
                            <CheckCircle className="h-4 w-4 mr-2" /> Importação Concluída
                          </>
                        ) : (
                          "Importar Empresas"
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {concluido && (
              <div className="space-y-6">
                {empresasImportadas.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Empresas Importadas ({empresasImportadas.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="list-disc pl-5 space-y-1">
                        {empresasImportadas.map((nome, index) => (
                          <li key={index}>{nome}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {empresasIgnoradas.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Empresas Ignoradas ({empresasIgnoradas.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="list-disc pl-5 space-y-1">
                        {empresasIgnoradas.map((nome, index) => (
                          <li key={index}>{nome}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                <div className="flex justify-center">
                  <Button onClick={() => router.push("/")} variant="outline">
                    Voltar para a Página Principal
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
