import { useQuery } from '@tanstack/react-query'
import { fetchNextEarnings, fetchNextDividend, fetchRSI } from '../lib/massiveApi'
import type { DividendInfo } from '../lib/massiveApi'

export interface TickerEnrichment {
  earningsDate: string | null   // next earnings YYYY-MM-DD
  dividend: DividendInfo | null // next ex-div
  rsi: number | null            // RSI-14
}

async function fetchEnrichment(tickers: string[]): Promise<Record<string, TickerEnrichment>> {
  const result: Record<string, TickerEnrichment> = {}

  // Batch 5 at a time to avoid hammering the API
  for (let i = 0; i < tickers.length; i += 5) {
    const batch = tickers.slice(i, i + 5)
    await Promise.allSettled(batch.map(async ticker => {
      const [earningsDate, dividend, rsi] = await Promise.allSettled([
        fetchNextEarnings(ticker),
        fetchNextDividend(ticker),
        fetchRSI(ticker),
      ])
      result[ticker] = {
        earningsDate: earningsDate.status === 'fulfilled' ? earningsDate.value : null,
        dividend:     dividend.status     === 'fulfilled' ? dividend.value     : null,
        rsi:          rsi.status          === 'fulfilled' ? rsi.value          : null,
      }
    }))
  }
  return result
}

export function useTickerEnrichment(tickers: string[]) {
  const key = [...tickers].sort().join(',')
  return useQuery({
    queryKey: ['enrichment', key],
    queryFn:  () => fetchEnrichment(tickers),
    staleTime: 15 * 60_000,
    enabled:   tickers.length > 0,
  })
}
