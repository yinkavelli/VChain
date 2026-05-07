// Massive.com (Polygon.io) data layer
// All requests route through /api/proxy which adds Bearer token server-side

const IS_PROD = import.meta.env.PROD

function apiUrl(path: string, params: Record<string, string> = {}): string {
  const qs = new URLSearchParams({ p: path, ...params }).toString()
  return `/api/proxy?${qs}`
}

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = IS_PROD
    ? apiUrl(path, params)
    : apiUrl(path, params) // always use proxy — API key never in browser
  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? `API ${res.status}`)
  }
  return res.json()
}

// ── Types ─────────────────────────────────────────────────────────────

export interface StockSnapshot {
  ticker: string
  day: { o: number; h: number; l: number; c: number; v: number; vw: number }
  lastQuote: { P: number; S: number; p: number; s: number } // ask/bid
  lastTrade: { p: number; s: number; t: number }
  min: { av: number; c: number; h: number; l: number; o: number; v: number }
  prevDay: { c: number; h: number; l: number; o: number; v: number; vw: number }
  todaysChangePerc: number
  todaysChange: number
  updated: number
}

export interface OptionContract {
  ticker: string           // e.g. O:AAPL250620C00150000
  details: {
    contract_type: 'call' | 'put'
    expiration_date: string  // YYYY-MM-DD
    strike_price: number
    shares_per_contract: number
    exercise_style: 'american' | 'european'
  }
  greeks: {
    delta: number
    gamma: number
    theta: number
    vega: number
  }
  implied_volatility: number  // as decimal e.g. 0.28 = 28%
  open_interest: number
  day: { o: number; h: number; l: number; c: number; v: number; vw: number }
  last_quote: { ask: number; ask_size: number; bid: number; bid_size: number; last_updated: number; midpoint: number }
  last_trade: { price: number; size: number; timestamp: number }
  underlying_asset: { price: number; ticker: string; timeframe: string }
  break_even_price: number
}

export interface OptionChainResult {
  results: OptionContract[]
  status: string
  request_id: string
  next_url?: string
}

export interface TickerDetails {
  ticker: string
  name: string
  market_cap: number
  description: string
  homepage_url: string
  list_date: string
  share_class_shares_outstanding: number
  weighted_shares_outstanding: number
  primary_exchange: string
}

// ── Stock snapshots (batch up to 250) ─────────────────────────────────

interface RawSnapshotResponse {
  tickers: Array<{
    ticker: string
    todaysChangePerc: number
    todaysChange: number
    updated: number
    day: { o: number; h: number; l: number; c: number; v: number; vw: number }
    lastQuote: { P: number; S: number; p: number; s: number }
    lastTrade: { p: number; s: number; t: number }
    prevDay: { c: number; h: number; l: number; o: number; v: number; vw: number }
    min: { av: number; c: number; h: number; l: number; o: number; v: number }
  }>
}

export async function fetchStockSnapshots(tickers: string[]): Promise<Map<string, StockSnapshot>> {
  const map = new Map<string, StockSnapshot>()
  // Batch in groups of 250
  for (let i = 0; i < tickers.length; i += 250) {
    const batch = tickers.slice(i, i + 250)
    try {
      const data = await get<RawSnapshotResponse>(
        '/v2/snapshot/locale/us/markets/stocks/tickers',
        { tickers: batch.join(',') }
      )
      for (const t of data.tickers ?? []) map.set(t.ticker, t as StockSnapshot)
    } catch { /* batch failure is non-fatal */ }
  }
  return map
}

// ── Option chain for one ticker ────────────────────────────────────────

export async function fetchOptionChain(
  ticker: string,
  params: {
    expiration_date?: string
    contract_type?: 'call' | 'put'
    strike_price_gte?: number
    strike_price_lte?: number
    limit?: number
  } = {}
): Promise<OptionContract[]> {
  const qp: Record<string, string> = { limit: String(params.limit ?? 250) }
  if (params.expiration_date)  qp.expiration_date  = params.expiration_date
  if (params.contract_type)    qp.contract_type    = params.contract_type
  if (params.strike_price_gte) qp['strike_price.gte'] = String(params.strike_price_gte)
  if (params.strike_price_lte) qp['strike_price.lte'] = String(params.strike_price_lte)

  const results: OptionContract[] = []
  let url: string | null = `/v3/snapshot/options/${ticker}`
  let first = true

  while (url) {
    try {
      const data: OptionChainResult = await get<OptionChainResult>(url, first ? qp : {})
      results.push(...(data.results ?? []))
      url = data.next_url
        ? data.next_url.replace('https://api.massive.com', '')
        : null
      first = false
      if (results.length >= 1000) break // safety cap
    } catch { break }
  }

  return results
}

// ── Historical daily aggregates (for IV Rank calculation) ─────────────

export interface DailyBar {
  t: number   // timestamp ms
  o: number; h: number; l: number; c: number; v: number; vw: number
}

export async function fetchDailyBars(
  ticker: string,
  from: string,  // YYYY-MM-DD
  to: string,
  multiplier = 1,
  timespan = 'day'
): Promise<DailyBar[]> {
  const data = await get<{ results: DailyBar[]; status: string }>(
    `/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}`,
    { adjusted: 'true', sort: 'asc', limit: '365' }
  )
  return data.results ?? []
}

// ── Ticker details (fundamentals) ─────────────────────────────────────

export async function fetchTickerDetails(ticker: string): Promise<TickerDetails | null> {
  try {
    const data = await get<{ results: TickerDetails }>(`/v3/reference/tickers/${ticker}`)
    return data.results ?? null
  } catch { return null }
}

// ── Related news ──────────────────────────────────────────────────────

export interface NewsItem {
  id: string
  title: string
  author: string
  published_utc: string
  article_url: string
  tickers: string[]
  description: string
}

export async function fetchNews(ticker: string): Promise<NewsItem[]> {
  try {
    const data = await get<{ results: NewsItem[] }>(
      '/v2/reference/news',
      { ticker, limit: '5', sort: 'published_utc', order: 'desc' }
    )
    return data.results ?? []
  } catch { return [] }
}
