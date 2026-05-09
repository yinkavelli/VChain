import { useQuery } from '@tanstack/react-query'
import { fetchOptionChain } from '../lib/massiveApi'
import type { Trade } from '../lib/supabase'

export interface LegPnL {
  entryPrice: number
  currentPrice: number | null
  pnl: number | null
}

export interface TradePnL {
  tradeId: string
  totalPnL: number | null   // null = no live prices available
  isStale: boolean          // true = fell back to prev-day close, not live quote
  legs: LegPnL[]
  isLoading: boolean
}

async function fetchLivePrices(trades: Trade[]): Promise<Record<string, TradePnL>> {
  const tickers = [...new Set(trades.map(t => t.ticker))]
  const result: Record<string, TradePnL> = {}

  // Init all trades
  for (const t of trades) {
    result[t.id] = { tradeId: t.id, totalPnL: null, isStale: false, legs: [], isLoading: false }
  }

  await Promise.allSettled(tickers.map(async ticker => {
    const tickerTrades = trades.filter(t => t.ticker === ticker)
    const expiries = [...new Set(tickerTrades.flatMap(t => t.strategy_data?.legs?.map(l => l.expiry) ?? []))]

    if (!expiries.length) return

    const minExpiry = expiries.reduce((a, b) => a < b ? a : b)
    const maxExpiry = expiries.reduce((a, b) => a > b ? a : b)

    let contracts
    try {
      contracts = await fetchOptionChain(ticker, {
        expiration_date_gte: minExpiry,
        expiration_date_lte: maxExpiry,
        limit: 250,
      })
    } catch { return }

    for (const trade of tickerTrades) {
      const legs = trade.strategy_data?.legs ?? []
      const legResults: LegPnL[] = []
      let totalPnL = 0
      let anyMissing = false
      let anyStale = false

      for (const leg of legs) {
        const match = contracts.find(c =>
          c.details.strike_price === leg.strike &&
          c.details.expiration_date === leg.expiry &&
          c.details.contract_type === leg.type.toLowerCase()
        )

        const livePrice  = match?.last_quote?.midpoint ?? match?.last_trade?.price ?? null
        const stalePrice = match?.day?.c ?? null
        const currentPrice = livePrice ?? stalePrice
        if (livePrice == null && stalePrice != null) anyStale = true

        const entryPrice = leg.price

        if (currentPrice == null) {
          anyMissing = true
          legResults.push({ entryPrice, currentPrice: null, pnl: null })
          continue
        }

        const direction = leg.action === 'SELL' ? -1 : 1
        const legPnL = direction * (currentPrice - entryPrice) * trade.quantity * 100
        totalPnL += legPnL
        legResults.push({ entryPrice, currentPrice, pnl: legPnL })
      }

      result[trade.id] = {
        tradeId: trade.id,
        totalPnL: anyMissing ? null : totalPnL,
        isStale: anyStale,
        legs: legResults,
        isLoading: false,
      }
    }
  }))

  return result
}

export function useLivePnL(trades: Trade[]) {
  const openTrades = trades.filter(t => t.status === 'OPEN')
  const tradeKey   = openTrades.map(t => t.id).join(',')

  return useQuery({
    queryKey: ['live-pnl', tradeKey],
    queryFn:  () => fetchLivePrices(openTrades),
    enabled:  openTrades.length > 0,
    staleTime: 30_000,
    refetchInterval: 30_000,
  })
}
