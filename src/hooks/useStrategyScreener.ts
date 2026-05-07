import { useQuery } from '@tanstack/react-query'
import { fetchOptionChain } from '../lib/massiveApi'
import { buildAllStrategies, type ScoredStrategy, type Thesis } from '../lib/strategyScorer'
import { SP500 } from '../data/sp500'

// Tight universe — most liquid options market, high OI, tight spreads
const SCAN_UNIVERSE = [
  'AAPL','MSFT','NVDA','AMZN','META','TSLA','JPM','AMD','NFLX','SPY',
  'GOOGL','V','MA','BAC','XOM','QQQ','AVGO','CRM','PANW','IWM',
]

export interface StrategyScreenResult extends ScoredStrategy {
  name: string
  sector: string
}

export interface IVStatsMap {
  [ticker: string]: { iv30: number; ivRank: number; ivHvRatio: number }
}

export function useStrategyScreener(
  spotPrices: Record<string, number>,
  ivStatsMap: IVStatsMap,
  _thesis: Thesis | 'All' = 'All',
  minScore = 50
) {
  return useQuery({
    queryKey: ['strategy-screener'],
    queryFn: async (): Promise<StrategyScreenResult[]> => {
      // Narrow date range — only 21-60 DTE (theta sweet spot, skip LEAPS)
      const from = new Date(Date.now() + 20  * 86_400_000).toISOString().slice(0, 10)
      const to   = new Date(Date.now() + 65  * 86_400_000).toISOString().slice(0, 10)
      const results: StrategyScreenResult[] = []

      // Sequential batches of 4 to avoid hammering the API
      for (let i = 0; i < SCAN_UNIVERSE.length; i += 4) {
        const batch = SCAN_UNIVERSE.slice(i, i + 4)
        await Promise.allSettled(batch.map(async ticker => {
          const spot = spotPrices[ticker]
          if (!spot || spot <= 0) return

          // Reuse IV stats already computed by the screener — no extra API calls
          const iv = ivStatsMap[ticker]
          const iv30      = iv?.iv30      ?? 0
          const ivRank    = iv?.ivRank    ?? 0
          const ivHvRatio = iv?.ivHvRatio ?? 0
          if (iv30 <= 0) return

          try {
            const contracts = await fetchOptionChain(ticker, {
              expiration_date_gte: from,
              expiration_date_lte: to,
              limit: 100,   // much smaller — only 21-60 DTE window
            })
            if (!contracts.length) return

            const meta = SP500.find(s => s.ticker === ticker)
            const strategies = buildAllStrategies(ticker, contracts, spot, iv30, ivRank, ivHvRatio, 35)

            for (const s of strategies) {
              if (s.score >= minScore) {
                results.push({ ...s, name: meta?.name ?? ticker, sector: meta?.sector ?? 'ETF' })
              }
            }
          } catch { /* skip */ }
        }))
      }

      return results.sort((a, b) => b.score - a.score).slice(0, 40)
    },
    staleTime:       25 * 60_000,
    refetchInterval: 25 * 60_000,
    enabled: Object.keys(spotPrices).length > 0,
  })
}
