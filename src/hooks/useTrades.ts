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
      const { data, error } = await supabase
        .from('trades')
        .insert({ ...trade, status: 'OPEN' })
        .select()
        .single()
      if (error) throw error
      return data as Trade
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
