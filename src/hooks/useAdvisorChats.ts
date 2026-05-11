import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AdvisorChat {
  id: string
  title: string
  messages: ChatMessage[]
  created_at: string
  updated_at: string
}

// Stable anonymous session key stored in localStorage
function getSessionKey(): string {
  let key = localStorage.getItem('vchain_session_key')
  if (!key) {
    key = crypto.randomUUID()
    localStorage.setItem('vchain_session_key', key)
  }
  return key
}

export function useAdvisorChats(userId: string | null) {
  const [chats, setChats]     = useState<AdvisorChat[]>([])
  const [loading, setLoading] = useState(false)
  const sessionKey = getSessionKey()

  const load = useCallback(async () => {
    setLoading(true)
    const query = supabase
      .from('advisor_chats')
      .select('id, title, messages, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(30)

    const { data, error } = userId
      ? await query.eq('user_id', userId)
      : await query.eq('session_key', sessionKey).is('user_id', null)

    if (!error && data) setChats(data as AdvisorChat[])
    setLoading(false)
  }, [userId, sessionKey])

  useEffect(() => { load() }, [load])

  const save = useCallback(async (messages: ChatMessage[]): Promise<string | null> => {
    if (messages.length === 0) return null
    const title = messages.find(m => m.role === 'user')?.content.slice(0, 60) ?? 'Chat'

    const row: Record<string, unknown> = { title, messages }
    if (userId) row['user_id'] = userId
    else row['session_key'] = sessionKey

    const { data, error } = await supabase
      .from('advisor_chats')
      .insert(row as any)
      .select('id')
      .single()

    if (error) { console.error('save chat:', error); return null }
    await load()
    return data?.id ?? null
  }, [userId, sessionKey, load])

  const update = useCallback(async (id: string, messages: ChatMessage[]) => {
    const title = messages.find(m => m.role === 'user')?.content.slice(0, 60) ?? 'Chat'
    await supabase.from('advisor_chats').update({ messages, title }).eq('id', id)
    // Optimistic local update
    setChats(prev => prev.map(c => c.id === id ? { ...c, messages, title } : c))
  }, [])

  const remove = useCallback(async (id: string) => {
    await supabase.from('advisor_chats').delete().eq('id', id)
    setChats(prev => prev.filter(c => c.id !== id))
  }, [])

  return { chats, loading, save, update, remove, reload: load }
}
