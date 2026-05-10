import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, type Trade } from '../lib/supabase'
import { fetchOptionChain } from '../lib/massiveApi'

async function computeExitPnL(trade: Trade): Promise<number> {
  const legs = trade.strategy_data?.legs ?? []
  if (!legs.length) return 0

  const minExpiry = legs.reduce((a, b) => a < b.expiry ? a : b.expiry, legs[0].expiry)
  const maxExpiry = legs.reduce((a, b) => a > b.expiry ? a : b.expiry, legs[0].expiry)

  let contracts: Awaited<ReturnType<typeof fetchOptionChain>> = []
  try {
    contracts = await fetchOptionChain(trade.ticker, {
      expiration_date_gte: minExpiry,
      expiration_date_lte: maxExpiry,
      limit: 250,
    })
  } catch { /* fall back to 0 */ }

  let netPnLPerShare = 0
  for (const leg of legs) {
    const match = contracts.find(c =>
      c.details.strike_price === leg.strike &&
      c.details.expiration_date === leg.expiry &&
      c.details.contract_type === leg.type.toLowerCase()
    )
    const currentPrice = match?.last_quote?.midpoint
      ?? match?.last_trade?.price
      ?? match?.day?.c
      ?? leg.price  // fallback: no change
    const direction = leg.action === 'SELL' ? -1 : 1
    netPnLPerShare += direction * (currentPrice - leg.price)
  }
  // Return net P&L per contract (× 100 multiplier), per quantity handled in ClosedCard
  return +(netPnLPerShare * 100).toFixed(2)
}

export function useTrades(userId?: string) {
  return useQuery({
    queryKey: ['paper_trades', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('paper_trades')
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
      const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/paper_trades`
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['paper_trades'] }),
  })
}

export function useCloseTrade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (trade: Trade) => {
      const exit_price = await computeExitPnL(trade)
      const { error } = await supabase
        .from('paper_trades')
        .update({ status: 'CLOSED', exit_price, exit_time: new Date().toISOString() })
        .eq('id', trade.id)
      if (error) throw error
      return exit_price
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['paper_trades'] }),
  })
}

export function useDeleteTrade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('paper_trades').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['paper_trades'] }),
  })
}

export function useClearTrades() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from('paper_trades').delete().eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['paper_trades'] }),
  })
}
