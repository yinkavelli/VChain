import { useQuery } from '@tanstack/react-query'
import { fetchStockSnapshots } from '../lib/massiveApi'
import { computeIVStats } from '../lib/ivRank'
import { SP500, BENCHMARKS, type SP500Stock } from '../data/sp500'

export interface ScreenerRow extends SP500Stock {
  price: number
  changePct: number
  change: number
  volume: number
  iv30: number
  ivRank: number
  hv30: number
  ivHvRatio: number
}

// Top-level screener: loads all S&P 500 prices, then lazily enriches IV
export function useScreener(sector = 'All') {
  return useQuery({
    queryKey: ['screener', sector],
    queryFn: async () => {
      const filtered = sector === 'All' ? SP500 : SP500.filter(s => s.sector === sector)
      const tickers  = [...filtered.map(s => s.ticker), ...BENCHMARKS]
      const snapMap  = await fetchStockSnapshots(tickers)

      const rows: ScreenerRow[] = filtered.map(s => {
        const snap = snapMap.get(s.ticker)
        return {
          ...s,
          // day.c is 0 outside market hours — fall back to min.c (last minute close) or prevDay.c
          price:      snap?.day?.c || snap?.min?.c || snap?.prevDay?.c || 0,
          changePct:  snap?.todaysChangePerc ?? 0,
          change:     snap?.todaysChange ?? 0,
          volume:     snap?.day?.v || snap?.min?.av || 0,
          iv30:       0,
          ivRank:     0,
          hv30:       0,
          ivHvRatio:  0,
        }
      }).filter(r => r.price > 0)

      return rows
    },
    staleTime:       5 * 60_000,
    refetchInterval: 5 * 60_000,
  })
}

// Enrich a single row with IV stats on demand
export function useTickerIV(ticker: string, spotPrice: number, enabled = true) {
  return useQuery({
    queryKey: ['iv', ticker],
    queryFn:  () => computeIVStats(ticker, spotPrice),
    enabled:  enabled && spotPrice > 0,
    staleTime: 15 * 60_000,
  })
}

// Collect all cached IV stats into a map for the strategy screener
import { useQueryClient } from '@tanstack/react-query'
import type { IVStatsMap } from './useStrategyScreener'

export function useIVStatsMap(tickers: string[]): IVStatsMap {
  const qc = useQueryClient()
  const map: IVStatsMap = {}
  for (const t of tickers) {
    const cached = qc.getQueryData<{ iv30: number; ivRank: number; ivHvRatio: number }>(['iv', t])
    if (cached) map[t] = cached
  }
  return map
}
