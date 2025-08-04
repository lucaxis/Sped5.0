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

      if (error) {
        console.error("Erro ao obter sessão:", error)
      }

      setSession(session)
      setUser(session?.user || null)

      if (session?.user) {
        const { data: perfilData } = await supabase.from("perfis").select("*").eq("id", session.user.id).single()

        setPerfil(perfilData)
      }

      setIsLoading(false)
    }

    getSession()

    // Configurar listener para mudanças de autenticação
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
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
