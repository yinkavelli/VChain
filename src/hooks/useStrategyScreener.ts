import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fetchOptionChain } from '../lib/massiveApi'
import { buildAllStrategies, type ScoredStrategy, type Thesis } from '../lib/strategyScorer'
import { SP500 } from '../data/sp500'

const SCAN_UNIVERSE = [
  'AAPL','MSFT','NVDA','AMZN','META','TSLA','JPM','AMD','NFLX','SPY',
  'GOOGL','V','MA','BAC','XOM','QQQ','AVGO','CRM','PANW','IWM',
]

const STALE_MINS = 35  // treat DB data as fresh if < 35 mins old

export interface StrategyScreenResult extends ScoredStrategy {
  name: string
  sector: string
  scannedAt?: string
}

function withMeta(s: ScoredStrategy, scannedAt?: string): StrategyScreenResult {
  const meta = SP500.find(x => x.ticker === s.ticker)
  return { ...s, name: meta?.name ?? s.ticker, sector: meta?.sector ?? 'ETF', scannedAt }
}

// ── Read from Supabase ────────────────────────────────────────────────

async function fetchFromDB(): Promise<{ results: StrategyScreenResult[]; scannedAt: string | null }> {
  const { data, error } = await supabase
    .from('strategy_scans')
    .select('data, scanned_at')
    .order('scanned_at', { ascending: false })
    .limit(60)

  if (error || !data?.length) return { results: [], scannedAt: null }

  const latestScan = data[0].scanned_at
  const ageMins    = (Date.now() - new Date(latestScan).getTime()) / 60_000

  if (ageMins > STALE_MINS) return { results: [], scannedAt: latestScan }

  const results = data.map(row => withMeta(row.data as ScoredStrategy, row.scanned_at))
  return { results, scannedAt: latestScan }
}

// ── Live scan fallback ────────────────────────────────────────────────

function computeIV30FromChain(
  contracts: Awaited<ReturnType<typeof fetchOptionChain>>,
  spot: number
): number {
  const now = Date.now()
  const atm = contracts
    .filter(c => {
      const d = Math.round((new Date(c.details.expiration_date + 'T20:00:00Z').getTime() - now) / 86_400_000)
      return d >= 10 && d <= 45 && Math.abs(c.details.strike_price - spot) / spot < 0.05 && (c.implied_volatility ?? 0) > 0
    })
    .sort((a, b) => Math.abs(a.details.strike_price - spot) - Math.abs(b.details.strike_price - spot))
    .slice(0, 8)
  if (!atm.length) return 0
  return +(atm.reduce((s, c) => s + (c.implied_volatility ?? 0), 0) / atm.length * 100).toFixed(1)
}

async function liveScan(spotPrices: Record<string, number>): Promise<StrategyScreenResult[]> {
  const from = new Date(Date.now() + 18 * 86_400_000).toISOString().slice(0, 10)
  const to   = new Date(Date.now() + 65 * 86_400_000).toISOString().slice(0, 10)
  const results: StrategyScreenResult[] = []

  for (let i = 0; i < SCAN_UNIVERSE.length; i += 4) {
    const batch = SCAN_UNIVERSE.slice(i, i + 4)
    await Promise.allSettled(batch.map(async ticker => {
      const spot = spotPrices[ticker]
      if (!spot || spot <= 0) return
      try {
        const contracts = await fetchOptionChain(ticker, { expiration_date_gte: from, expiration_date_lte: to, limit: 120 })
        if (contracts.length < 5) return
        const iv30 = computeIV30FromChain(contracts, spot)
        if (iv30 <= 0) return
        const ivRank = Math.min(99, Math.round(iv30 * 0.9))
        const strategies = buildAllStrategies(ticker, contracts, spot, iv30, ivRank, 1.0, 35)
        for (const s of strategies) {
          if (s.score >= 45) results.push(withMeta(s))
        }
      } catch {}
    }))
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 40)
}

// ── Main hook ─────────────────────────────────────────────────────────

export function useStrategyScreener(
  spotPrices: Record<string, number>,
  _thesis: Thesis | 'All' = 'All',
  _minScore = 50
) {
  const hasSpots = Object.keys(spotPrices).length > 5
  const spotHash = Object.values(spotPrices).slice(0, 5).join(',')

  return useQuery({
    queryKey: ['strategy-screener', spotHash],
    queryFn: async (): Promise<StrategyScreenResult[]> => {
      // 1. Try Supabase first
      const { results: dbResults, scannedAt } = await fetchFromDB()
      if (dbResults.length > 0) {
        console.log(`[Strategies] Loaded ${dbResults.length} from DB (scanned ${scannedAt})`)
        return dbResults
      }
      // 2. Fall back to live scan — and persist results to DB
      console.log('[Strategies] DB empty/stale — running live scan')
      const liveResults = await liveScan(spotPrices)
      if (liveResults.length > 0) {
        await supabase.from('strategy_scans')
          .delete()
          .lt('scanned_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
        const { error } = await supabase.from('strategy_scans')
          .insert(liveResults.map(s => ({ data: s })))
        if (error) console.error('[Strategies] DB write failed:', error.message)
        else console.log(`[Strategies] Saved ${liveResults.length} strategies to DB`)
      }
      return liveResults
    },
    staleTime:       STALE_MINS * 60_000,
    refetchInterval: STALE_MINS * 60_000,
    enabled: hasSpots,
    retry: 1,
  })
}

// ── Manual rescan trigger ─────────────────────────────────────────────

export function useRescan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/scan?force=1', {
        headers: { Authorization: `Bearer ${import.meta.env.VITE_CRON_SECRET}` },
      })
      if (!res.ok) throw new Error('Scan failed')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['strategy-screener'] })
    },
  })
}
