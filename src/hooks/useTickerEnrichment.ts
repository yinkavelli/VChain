import { useQuery } from '@tanstack/react-query'
import { fetchNextEarnings, fetchNextDividend, fetchRSI, fetchSparkline, fetchNews, fetchTickerDetails } from '../lib/massiveApi'
import type { DividendInfo, NewsItem } from '../lib/massiveApi'

export interface TickerEnrichment {
  earningsDate: string | null
  dividend: DividendInfo | null
  rsi: number | null
  companyName: string | null
  sparkline: number[]
  news: Pick<NewsItem, 'id' | 'title' | 'published_utc' | 'article_url'>[]
}

async function fetchEnrichment(tickers: string[]): Promise<Record<string, TickerEnrichment>> {
  const result: Record<string, TickerEnrichment> = {}

  for (let i = 0; i < tickers.length; i += 5) {
    const batch = tickers.slice(i, i + 5)
    await Promise.allSettled(batch.map(async ticker => {
      const [earningsDate, dividend, rsi, details, sparkline, news] = await Promise.allSettled([
        fetchNextEarnings(ticker),
        fetchNextDividend(ticker),
        fetchRSI(ticker),
        fetchTickerDetails(ticker),
        fetchSparkline(ticker, 20),
        fetchNews(ticker, 2),
      ])
      result[ticker] = {
        earningsDate: earningsDate.status === 'fulfilled' ? earningsDate.value : null,
        dividend:     dividend.status     === 'fulfilled' ? dividend.value     : null,
        rsi:          rsi.status          === 'fulfilled' ? rsi.value          : null,
        companyName:  details.status      === 'fulfilled' ? (details.value?.name ?? null) : null,
        sparkline:    sparkline.status    === 'fulfilled' ? sparkline.value    : [],
        news:         news.status         === 'fulfilled' ? news.value         : [],
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
