import { useQuery } from '@tanstack/react-query'
import { fetchOptionChain } from '../lib/massiveApi'
import { computeIVStats } from '../lib/ivRank'
import { buildAllStrategies, type ScoredStrategy, type Thesis } from '../lib/strategyScorer'
import { SP500 } from '../data/sp500'

// Pre-selected high-optionality stocks — liquid chains, active options market
const SCAN_UNIVERSE = [
  'AAPL','MSFT','NVDA','AMZN','META','GOOGL','TSLA','JPM','AMD','NFLX',
  'BAC','V','MA','AVGO','CRM','ADBE','PANW','NOW','INTC','MU',
  'XOM','CVX','SLB','EOG','FCX',
  'JNJ','LLY','ABBV','MRK','AMGN','GILD','VRTX',
  'SPY','QQQ','IWM','GLD','SLV',
]

export interface StrategyScreenResult extends ScoredStrategy {
  name: string
  sector: string
}

export function useStrategyScreener(
  spotPrices: Record<string, number>,
  thesis: Thesis | 'All' = 'All',
  minScore = 50
) {
  return useQuery({
    queryKey: ['strategy-screener', thesis],
    queryFn: async (): Promise<StrategyScreenResult[]> => {
      const twoYearsOut = new Date(Date.now() + 730 * 86_400_000).toISOString().slice(0, 10)
      const results: StrategyScreenResult[] = []

      // Process in small batches to avoid rate limiting
      const BATCH = 5
      for (let i = 0; i < SCAN_UNIVERSE.length; i += BATCH) {
        const batch = SCAN_UNIVERSE.slice(i, i + BATCH)

        await Promise.allSettled(batch.map(async ticker => {
          const spot = spotPrices[ticker]
          if (!spot || spot <= 0) return

          try {
            const [contracts, ivStats] = await Promise.all([
              fetchOptionChain(ticker, { expiration_date_lte: twoYearsOut, limit: 250 }),
              computeIVStats(ticker, spot),
            ])
            if (!contracts.length) return

            const { iv30, ivRank, ivHvRatio } = ivStats
            if (iv30 <= 0) return

            const strategies = buildAllStrategies(ticker, contracts, spot, iv30, ivRank, ivHvRatio)
            const meta = SP500.find(s => s.ticker === ticker)

            for (const s of strategies) {
              if (s.score >= minScore) {
                results.push({
                  ...s,
                  name:   meta?.name ?? ticker,
                  sector: meta?.sector ?? 'ETF',
                })
              }
            }
          } catch { /* skip failed tickers */ }
        }))
      }

      return results
        .filter(r => thesis === 'All' || r.thesis === thesis)
        .sort((a, b) => b.score - a.score)
        .slice(0, 50)
    },
    staleTime:       20 * 60_000,  // cache 20 min
    refetchInterval: 20 * 60_000,
    enabled: Object.keys(spotPrices).length > 0,
  })
}
