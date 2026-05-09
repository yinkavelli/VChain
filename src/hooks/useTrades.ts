import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, type Trade } from '../lib/supabase'

export function useTrades(userId?: string) {
  return useQuery({
    queryKey: ['trades', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trades')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Trade[]
    },
    enabled: !!userId,
  })
}

export function useBookTrade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (trade: Omit<Trade, 'id' | 'created_at' | 'status'>) => {
      // Use fetch directly to bypass Supabase JS schema cache
      const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/trades`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'apikey':       import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer':       'return=representation',
        },
        body: JSON.stringify({ ...trade, status: 'OPEN' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? data.error ?? 'Insert failed')
      return (Array.isArray(data) ? data[0] : data) as Trade
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trades'] }),
  })
}

export function useCloseTrade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, exit_price }: { id: string; exit_price: number }) => {
      const { error } = await supabase
        .from('trades')
        .update({ status: 'CLOSED', exit_price, exit_time: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trades'] }),
  })
}

export function useDeleteTrade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trades').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trades'] }),
  })
}

export function useClearTrades() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from('trades').delete().eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trades'] }),
  })
}
