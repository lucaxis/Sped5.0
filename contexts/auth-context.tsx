"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import type { Session, User } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import type { Perfil } from "@/lib/database.types"
import { useRouter } from "next/navigation"

type AuthContextType = {
  user: User | null
  session: Session | null
  perfil: Perfil | null
  isLoading: boolean
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signUp: (email: string, password: string, nome: string, cargo: string) => Promise<{ error: any }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    // Verificar sessão atual
    const getSession = async () => {
      setIsLoading(true)
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession()

      // ⚠️ Token de refresh inválido – limpa tudo e força login
      if (error && error.message?.includes("Invalid Refresh Token")) {
        console.warn("[Auth] Refresh token inválido. Limpando sessão local.")
        await supabase.auth.signOut({ scope: "local" }) // remove apenas do cliente
        setSession(null)
        setUser(null)
        setPerfil(null)
        setIsLoading(false)
        return
      }

      console.log("DEBUG: Sessão obtida:", session) //teste
      if (error) {
        console.error("Erro ao obter sessão:", error)
      }

      setSession(session)
      setUser(session?.user || null)

      console.log("DEBUG: user object depois de set:", session?.user) // teste
      if (session?.user) {
        const userId = session.user.id
        console.log("DEBUG: userId obtido (Passo 1):", userId) // Este deve aparecer

        let cleanedUserId: string // Declare a variável explicitamente

        console.log("DEBUG: Antes da verificação de ':' (Passo 2)") // Verifique se este aparece

        if (userId.includes(":")) {
          cleanedUserId = userId.split(":")[0]
          console.log("DEBUG: userId CONTINHA ':' (Passo 3a):", cleanedUserId) // Verifique se este aparece
        } else {
          cleanedUserId = userId
          console.log("DEBUG: userId NÃO CONTINHA ':' (Passo 3b):", cleanedUserId) // Verifique se este aparece
        }

        console.log("DEBUG: Depois do cálculo de cleanedUserId (Passo 4):", cleanedUserId) // Este é o log alvo!

        try {
          const { data: perfilData, error: perfilError } = await supabase
            .from("perfis")
            .select("*")
            .eq("id", cleanedUserId) // Usar o ID "limpo"
            .single()

          if (perfilError) {
            console.error("ERRO AO BUSCAR PERFIL:", perfilError)
            console.error(
              "DETALHES DO ERRO DO PERFIL:",
              perfilError.message,
              perfilError.code,
              perfilError.details,
              perfilError.hint,
            )
          } else {
            console.log("Perfil buscado com sucesso:", perfilData)
          }
          setPerfil(perfilData)
        } catch (err) {
          console.error("ERRO INESPERADO NA BUSCA DO PERFIL (catch):", err)
        }
      }

      setIsLoading(false) // já fora dos fluxos de erro
    }

    getSession()

    // Configurar listener para mudanças de autenticação
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (event === "TOKEN_REFRESH_FAILED") {
        console.warn("[Auth] Falha ao renovar token. Limpando sessão local.")
        await supabase.auth.signOut({ scope: "local" })
        setSession(null)
        setUser(null)
        setPerfil(null)
        router.push("/login")
        return
      }

      setSession(newSession)
      setUser(newSession?.user || null)

      if (newSession?.user) {
        const { data: perfilData } = await supabase.from("perfis").select("*").eq("id", newSession.user.id).single()

        setPerfil(perfilData)
      } else {
        setPerfil(null)
      }

      router.refresh()
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [router])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  const signUp = async (email: string, password: string, nome: string, cargo: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password })

    if (!error && data.user) {
      // Criar perfil do usuário
      await supabase.from("perfis").insert({
        id: data.user.id,
        nome,
        cargo,
      })
    }

    return { error }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    router.push("/login")
  }

  const value = {
    user,
    session,
    perfil,
    isLoading,
    signIn,
    signUp,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth deve ser usado dentro de um AuthProvider")
  }
  return context
}
