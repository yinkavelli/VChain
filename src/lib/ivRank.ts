// IV Rank calculation using historical daily bars from Massive
// Fetches 1 year of ATM option IVs and computes percentile rank

import { fetchOptionChain, fetchDailyBars } from './massiveApi'
import { solveIV } from './blackScholes'

const ivCache = new Map<string, { rank: number; iv30: number; hv30: number; ts: number }>()
const CACHE_TTL = 15 * 60 * 1000  // 15 min (matches Starter tier delay)

export async function computeIVStats(ticker: string, spotPrice: number): Promise<{
  iv30: number
  ivRank: number
  hv30: number
  ivHvRatio: number
}> {
  const cached = ivCache.get(ticker)
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return { iv30: cached.iv30, ivRank: cached.rank, hv30: cached.hv30, ivHvRatio: cached.hv30 > 0 ? +(cached.iv30 / cached.hv30).toFixed(2) : 0 }
  }

  try {
    // 1. Current IV — from ATM options with 20-40 DTE
    const chain = await fetchOptionChain(ticker, { contract_type: 'call', limit: 50 })
    const now   = Date.now()
    const atmContracts = chain
      .filter(c => {
        const dte = Math.round((new Date(c.details.expiration_date).getTime() - now) / 86_400_000)
        return dte >= 15 && dte <= 45
      })
      .sort((a, b) => Math.abs(a.details.strike_price - spotPrice) - Math.abs(b.details.strike_price - spotPrice))
      .slice(0, 6)

    const ivs = atmContracts.map(c => (c.implied_volatility ?? 0) * 100).filter(v => v > 0)
    const iv30 = ivs.length > 0 ? +(ivs.reduce((s, v) => s + v, 0) / ivs.length).toFixed(1) : 0

    // 2. HV30 — from 32 daily spot closes
    const toDate   = new Date().toISOString().slice(0, 10)
    const fromDate = new Date(Date.now() - 40 * 86_400_000).toISOString().slice(0, 10)
    const bars     = await fetchDailyBars(ticker, fromDate, toDate)
    let hv30 = 0
    if (bars.length >= 2) {
      const closes = bars.map(b => b.c)
      const logRet = closes.slice(1).map((c, i) => Math.log(c / closes[i]))
      const n    = logRet.length
      const mean = logRet.reduce((s, r) => s + r, 0) / n
      const variance = logRet.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1)
      hv30 = +(Math.sqrt(variance) * Math.sqrt(252) * 100).toFixed(1)
    }

    // 3. IV Rank — fetch 1 year of daily bars for the same ATM option's historical IV
    //    Using stock close bars as proxy + current IV — build a 252-day IV series
    //    using the Massive historical aggregates for the nearest ATM option
    let ivRank = 0
    if (atmContracts.length > 0 && iv30 > 0) {
      try {
        const atmSym = atmContracts[0].ticker
        const ivFromDate = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10)
        const optBars    = await fetchDailyBars(atmSym, ivFromDate, toDate)
        const spotBars   = await fetchDailyBars(ticker, ivFromDate, toDate)
        const spotMap    = new Map(spotBars.map(b => [b.t, b.c]))
        const expiryMs   = new Date(atmContracts[0].details.expiration_date).getTime()
        const strike     = atmContracts[0].details.strike_price

        const ivSeries: number[] = []
        for (const bar of optBars) {
          const S = spotMap.get(bar.t)
          if (!S || S <= 0 || bar.c <= 0) continue
          const T = Math.max(0, (expiryMs - bar.t) / (365 * 86_400_000))
          if (T <= 0) continue
          const iv = solveIV(bar.c, S, strike, T, 'call')
          if (iv > 0 && iv < 500) ivSeries.push(iv)
        }

        if (ivSeries.length >= 10) {
          const mn = Math.min(...ivSeries)
          const mx = Math.max(...ivSeries)
          ivRank = mx > mn ? Math.min(99, Math.round(((iv30 - mn) / (mx - mn)) * 100)) : 50
        }
      } catch { /* IV Rank is non-fatal */ }
    }

    const result = { iv30, rank: ivRank, hv30, ts: Date.now() }
    ivCache.set(ticker, result)
    return { iv30, ivRank, hv30, ivHvRatio: hv30 > 0 ? +(iv30 / hv30).toFixed(2) : 0 }
  } catch {
    return { iv30: 0, ivRank: 0, hv30: 0, ivHvRatio: 0 }
  }
}
