import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchStockSnapshots, fetchMarketMovers } from '../lib/massiveApi'
import { motion } from 'framer-motion'
import { Activity, TrendingUp, BarChart2, Zap, Circle } from 'lucide-react'
import { StatCard } from './StatCard'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { ScreenerRow } from '../hooks/useScreener'
import { useMarketStatus } from '../hooks/useMarketStatus'

interface Props {
  stocks: ScreenerRow[]
  onSelectTicker: (ticker: string) => void
}

// SPY = cap-weighted S&P 500 proxy — already in our stocks list

function fmtPrice(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function DashboardView({ stocks, onSelectTicker }: Props) {
  const { data: marketStatus } = useMarketStatus()

  const { data: marketGainers = [] } = useQuery({
    queryKey: ['market-gainers'],
    queryFn: () => fetchMarketMovers('gainers'),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  })

  const { data: marketLosers = [] } = useQuery({
    queryKey: ['market-losers'],
    queryFn: () => fetchMarketMovers('losers'),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  })

  const fallbackGainers = useMemo(() => [...stocks].sort((a, b) => b.changePct - a.changePct).slice(0, 8), [stocks])
  const fallbackLosers  = useMemo(() => [...stocks].sort((a, b) => a.changePct - b.changePct).slice(0, 8), [stocks])
  const gainers = marketGainers.length > 0 ? marketGainers : fallbackGainers
  const losers  = marketLosers.length  > 0 ? marketLosers  : fallbackLosers

  const { data: benchmarks } = useQuery({
    queryKey: ['benchmarks'],
    queryFn: async () => {
      const m = await fetchStockSnapshots(['SPY', 'QQQ', 'IWM'])
      return m
    },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  })

  const spySnap    = benchmarks?.get('SPY')
  const spyChange  = spySnap?.todaysChangePerc ?? null

  const advancers   = stocks.filter(s => s.changePct > 0).length
  const decliners   = stocks.filter(s => s.changePct < 0).length
  const advDecRatio = decliners > 0 ? (advancers / decliners).toFixed(2) : '—'
  const avgChange   = stocks.length
    ? (stocks.reduce((s, r) => s + r.changePct, 0) / stocks.length).toFixed(2)
    : '0'
  const sentiment   = parseFloat(avgChange) > 0.5 ? 'Bullish' : parseFloat(avgChange) < -0.5 ? 'Bearish' : 'Neutral'

  const sectorData = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>()
    for (const s of stocks) {
      const cur = map.get(s.sector) ?? { total: 0, count: 0 }
      map.set(s.sector, { total: cur.total + s.changePct, count: cur.count + 1 })
    }
    const abbrev: Record<string, string> = {
      'Information Technology': 'Tech',
      'Consumer Discretionary': 'Disc.',
      'Consumer Staples':       'Staples',
      'Communication Services': 'Comm.',
      'Health Care':            'Health',
      'Real Estate':            'RE',
      'Financials':             'Finance',
      'Industrials':            'Indust.',
      'Materials':              'Materials',
      'Energy':                 'Energy',
      'Utilities':              'Utilities',
      'ETF':                    'ETF',
    }
    return [...map.entries()]
      .map(([sector, { total, count }]) => ({
        sector:   abbrev[sector] ?? sector.split(' ')[0],
        fullName: sector,
        avg:      +(total / count).toFixed(2),
      }))
      .sort((a, b) => b.avg - a.avg)
  }, [stocks])

  if (!stocks.length) return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center space-y-2">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-slate-500">Loading market data…</p>
      </div>
    </div>
  )

  const statusColor = marketStatus?.market === 'open' ? '#10b981'
    : marketStatus?.market === 'extended-hours' ? '#f59e0b' : '#ef4444'
  const statusLabel = marketStatus?.market === 'open' ? 'Market Open'
    : marketStatus?.market === 'extended-hours' ? 'Extended Hours' : 'Market Closed'

  return (
    <div className="space-y-5">
      {/* Market status pill */}
      {marketStatus && (
        <div className="flex items-center justify-end gap-1.5">
          <Circle className="w-2 h-2 fill-current" style={{ color: statusColor }} />
          <span className="text-[11px] font-medium" style={{ color: statusColor }}>{statusLabel}</span>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Market Mood" value={sentiment}
          sub={`${parseFloat(avgChange) >= 0 ? '+' : ''}${avgChange}% · ${advancers} up · ${decliners} down`}
          icon={<Activity className="w-4 h-4" />}
          color={sentiment === 'Bullish' ? 'emerald' : sentiment === 'Bearish' ? 'red' : 'indigo'}
          delay={0}
          tooltip={{
            title: 'Market Sentiment',
            body: 'Derived from the average % change of all S&P 500 stocks loaded. Bullish when average gain > 0.5%, Bearish when average loss > 0.5%, Neutral otherwise.',
            how: 'Use as a broad market filter. In Bullish markets favour debit spreads and long calls. In Bearish markets favour puts and credit spreads on rallies.',
            signal: 'Bullish > +0.5% avg · Bearish < -0.5% avg · Neutral in between',
          }} />
        <StatCard label="Adv / Dec Ratio"
          value={advDecRatio}
          sub={`${advancers} advancing`}
          icon={<BarChart2 className="w-4 h-4" />}
          color={parseFloat(advDecRatio) > 1 ? 'emerald' : 'red'}
          delay={0.05}
          tooltip={{
            title: 'Advance / Decline Ratio',
            body: 'The ratio of advancing stocks to declining stocks in the current S&P 500 snapshot. A ratio above 1 means more stocks are up than down — broad participation in any rally.',
            how: 'A ratio above 2.0 indicates strong broad-based buying. Below 0.5 indicates heavy selling pressure. Values near 1.0 suggest a mixed or transitioning market.',
            signal: 'A/D > 2.0 → Strong breadth. A/D < 0.5 → Broad selling. A/D ~1.0 → Mixed.',
          }} />
        <StatCard label="Avg vs SPY"
          value={`${parseFloat(avgChange) >= 0 ? '+' : ''}${avgChange}%`}
          sub={spyChange !== null
            ? `SPY (cap-wtd): ${spyChange >= 0 ? '+' : ''}${spyChange.toFixed(2)}%`
            : 'Loading SPY…'}
          icon={<TrendingUp className="w-4 h-4" />}
          color={parseFloat(avgChange) >= 0 ? 'emerald' : 'red'}
          delay={0.1}
          tooltip={{
            title: 'Equal-Weight Avg vs SPY',
            body: 'Top number = equal-weighted average move of all loaded stocks (each stock counts equally). Bottom = SPY ETF change (cap-weighted — AAPL/MSFT/NVDA dominate). When they diverge it tells you who\'s driving the market.',
            how: 'Avg > SPY → Broad participation, healthy rally. Avg < SPY → Only mega-caps moving, narrow and fragile. Avg << SPY → Mega-cap masks weakness underneath.',
            signal: 'Avg ≈ SPY → Healthy. Avg > SPY → Broad breadth. Avg << SPY → Mega-cap led, be cautious.',
          }} />
        <StatCard label="Universe"
          value={`${stocks.length}`}
          sub="S&P 500 stocks loaded"
          icon={<Zap className="w-4 h-4" />}
          color="violet"
          delay={0.15}
          tooltip={{
            title: 'Coverage',
            body: 'Number of S&P 500 constituents currently loaded with live price data from Massive.com. Data is delayed 15 minutes on the Starter plan.',
            how: 'Use the Screener tab to filter by sector, search by ticker or company name, and drill into individual option chains.',
            signal: '500 = full index coverage',
          }} />
      </div>

      {/* Sector performance chart */}
      {sectorData.length > 0 && (
        <div className="sector-card p-4">
          <div className="card-shimmer" />
          <p className="relative z-10 text-xs font-semibold mb-3" style={{ color: 'var(--text-sub)' }}>Sector Performance (today)</p>
          <div className="relative z-10">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={sectorData} margin={{ top: 4, right: 4, left: 0, bottom: 28 }}>
              <XAxis dataKey="sector" tick={{ fontSize: 8, fill: '#64748b' }} tickLine={false} axisLine={false}
                angle={-35} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 8, fill: '#64748b' }} tickLine={false} axisLine={false}
                tickFormatter={v => `${v > 0 ? '+' : ''}${v}%`} width={36} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload as { sector: string; fullName: string; avg: number }
                  return (
                    <div style={{ background: 'var(--payoff-tooltip-bg)', border: '1px solid var(--payoff-tooltip-border)', borderRadius: 8, padding: '8px 12px', boxShadow: 'var(--card-shadow-glow)' }}>
                      <p style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 11, marginBottom: 2 }}>{d.fullName}</p>
                      <p style={{ color: 'var(--text)', fontSize: 11 }}>Avg change: {d.avg > 0 ? '+' : ''}{d.avg.toFixed(2)}%</p>
                    </div>
                  )
                }}
              />
              <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                {sectorData.map((s, i) => (
                  <Cell key={i} fill={s.avg >= 0 ? '#10b981' : '#ef4444'} fillOpacity={0.8} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Top movers */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Top Gainers', list: gainers, cls: 'mover-gain', textColor: 'text-emerald-400', sign: '+' },
          { label: 'Top Losers',  list: losers,  cls: 'mover-loss', textColor: 'text-red-400',     sign: '' },
        ].map(({ label, list, cls, textColor, sign }) => (
          <div key={label}>
            <div className="flex items-center justify-between mb-2">
              <p className={`text-xs font-semibold ${textColor}`}>{label}</p>
              {marketGainers.length > 0 && <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>full market</span>}
            </div>
            <div className="space-y-1.5">
              {(list as any[]).map((s, i) => {
                const ticker = s.ticker
                const price  = s.day?.c ?? s.price ?? 0
                const pct    = s.todaysChangePerc ?? s.changePct ?? 0
                return (
                  <motion.button key={ticker}
                    initial={{ opacity: 0, x: sign === '+' ? -8 : 8 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    onClick={() => onSelectTicker(ticker)}
                    className={`${cls} w-full flex items-center justify-between px-3 py-2`}>
                    <div className="text-left">
                      <p className="text-xs font-bold" style={{ color: 'var(--text)' }}>{ticker}</p>
                      <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{fmtPrice(price)}</p>
                    </div>
                    <span className={`text-xs font-mono font-bold ${textColor}`}>
                      {sign}{pct.toFixed(2)}%
                    </span>
                  </motion.button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
