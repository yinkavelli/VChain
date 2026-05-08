import { useQuery } from '@tanstack/react-query'
import { fetchOptionChain } from '../lib/massiveApi'
import { buildAllStrategies, type ScoredStrategy, type Thesis } from '../lib/strategyScorer'
import { SP500 } from '../data/sp500'

// Most liquid options — tight spreads, high OI, active market
const SCAN_UNIVERSE = [
  'AAPL','MSFT','NVDA','AMZN','META','TSLA','JPM','AMD','NFLX','SPY',
  'GOOGL','V','MA','BAC','XOM','QQQ','AVGO','CRM','PANW','IWM',
]

export interface StrategyScreenResult extends ScoredStrategy {
  name: string
  sector: string
}

// Compute IV30 directly from ATM option chain — no extra API call
function computeIV30FromChain(
  contracts: Awaited<ReturnType<typeof fetchOptionChain>>,
  spot: number
): number {
  const now = Date.now()
  const atm = contracts
    .filter(c => {
      const dte = Math.round((new Date(c.details.expiration_date + 'T20:00:00Z').getTime() - now) / 86_400_000)
      const pct = Math.abs(c.details.strike_price - spot) / spot
      return dte >= 10 && dte <= 45 && pct < 0.05 && (c.implied_volatility ?? 0) > 0
    })
    .sort((a, b) => Math.abs(a.details.strike_price - spot) - Math.abs(b.details.strike_price - spot))
    .slice(0, 8)

  if (!atm.length) return 0
  return +( atm.reduce((s, c) => s + (c.implied_volatility ?? 0), 0) / atm.length * 100 ).toFixed(1)
}

export function useStrategyScreener(
  spotPrices: Record<string, number>,
  _thesis: Thesis | 'All' = 'All',
  minScore = 50
) {
  // Re-run when spot prices actually have data
  const hasSpots = Object.keys(spotPrices).length > 5
  const spotHash = Object.values(spotPrices).slice(0, 5).join(',')

  return useQuery({
    queryKey: ['strategy-screener', spotHash],
    queryFn: async (): Promise<StrategyScreenResult[]> => {
      const from = new Date(Date.now() + 18  * 86_400_000).toISOString().slice(0, 10)
      const to   = new Date(Date.now() + 65  * 86_400_000).toISOString().slice(0, 10)
      const results: StrategyScreenResult[] = []

      // Batches of 4 — sequential to avoid rate limits
      for (let i = 0; i < SCAN_UNIVERSE.length; i += 4) {
        const batch = SCAN_UNIVERSE.slice(i, i + 4)
        await Promise.allSettled(batch.map(async ticker => {
          const spot = spotPrices[ticker]
          if (!spot || spot <= 0) return

          try {
            const contracts = await fetchOptionChain(ticker, {
              expiration_date_gte: from,
              expiration_date_lte: to,
              limit: 120,
            })
            if (contracts.length < 5) return

            // Self-contained IV computation — no extra API calls
            const iv30 = computeIV30FromChain(contracts, spot)
            if (iv30 <= 0) return

            // Simple IV rank heuristic from current vol level
            // (proper rank needs history — approximate until Supabase builds up)
            const ivRank    = Math.min(99, Math.round(iv30 * 0.9))
            const ivHvRatio = iv30 > 0 ? +(iv30 / Math.max(iv30 * 0.85, 1)).toFixed(2) : 1.0

            const meta       = SP500.find(s => s.ticker === ticker)
            const strategies = buildAllStrategies(ticker, contracts, spot, iv30, ivRank, ivHvRatio, 35)

            for (const s of strategies) {
              if (s.score >= minScore) {
                results.push({ ...s, name: meta?.name ?? ticker, sector: meta?.sector ?? 'ETF' })
              }
            }
          } catch { /* skip failed ticker */ }
        }))
      }

      return results.sort((a, b) => b.score - a.score).slice(0, 40)
    },
    staleTime:       20 * 60_000,
    refetchInterval: 25 * 60_000,
    enabled: hasSpots,
    retry: 1,
  })
}
