import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Activity, TrendingUp, BarChart2, Zap } from 'lucide-react'
import { StatCard } from './StatCard'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { ScreenerRow } from '../hooks/useScreener'

interface Props {
  stocks: ScreenerRow[]
  onSelectTicker: (ticker: string) => void
}

// SPY = cap-weighted S&P 500 proxy — already in our stocks list

function fmtPrice(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function DashboardView({ stocks, onSelectTicker }: Props) {
  const gainers = useMemo(() =>
    [...stocks].sort((a, b) => b.changePct - a.changePct).slice(0, 5), [stocks])

  const losers = useMemo(() =>
    [...stocks].sort((a, b) => a.changePct - b.changePct).slice(0, 5), [stocks])

  const advancers   = stocks.filter(s => s.changePct > 0).length
  const decliners   = stocks.filter(s => s.changePct < 0).length
  const advDecRatio = decliners > 0 ? (advancers / decliners).toFixed(2) : '—'
  const avgChange   = stocks.length
    ? (stocks.reduce((s, r) => s + r.changePct, 0) / stocks.length).toFixed(2)
    : '0'
  const spyChange   = stocks.find(s => s.ticker === 'SPY')?.changePct ?? null
  const sentiment   = parseFloat(avgChange) > 0.5 ? 'Bullish' : parseFloat(avgChange) < -0.5 ? 'Bearish' : 'Neutral'

  const sectorData = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>()
    for (const s of stocks) {
      const cur = map.get(s.sector) ?? { total: 0, count: 0 }
      map.set(s.sector, { total: cur.total + s.changePct, count: cur.count + 1 })
    }
    return [...map.entries()]
      .map(([sector, { total, count }]) => ({ sector: sector.split(' ')[0], avg: +(total / count).toFixed(2) }))
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

  return (
    <div className="space-y-5">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Market Mood" value={sentiment}
          sub={`${advancers} up · ${decliners} down`}
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
        <div className="rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-sub)' }}>Sector Performance (today)</p>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={sectorData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <XAxis dataKey="sector" tick={{ fontSize: 8, fill: '#64748b' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 8, fill: '#64748b' }} tickLine={false} axisLine={false}
                tickFormatter={v => `${v > 0 ? '+' : ''}${v}%`} width={36} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  return (
                    <div style={{ background: '#0d0d20', border: '1px solid #6366f1', borderRadius: 8, padding: '8px 12px' }}>
                      <p style={{ color: '#a5b4fc', fontWeight: 600, fontSize: 11, marginBottom: 2 }}>{label}</p>
                      <p style={{ color: '#e2e8f0', fontSize: 11 }}>Avg change : {Number(payload[0].value) > 0 ? '+' : ''}{Number(payload[0].value).toFixed(2)}%</p>
                    </div>
                  )
                }}
                formatter={(v) => [`${Number(v) > 0 ? '+' : ''}${Number(v)}%`, 'Avg change']}
              />
              <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                {sectorData.map((s, i) => (
                  <Cell key={i} fill={s.avg >= 0 ? '#10b981' : '#ef4444'} fillOpacity={0.8} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top movers */}
      <div className="grid grid-cols-2 gap-3">
        {/* Gainers */}
        <div>
          <p className="text-xs font-semibold text-emerald-500 mb-2">Top Gainers</p>
          <div className="space-y-1.5">
            {gainers.map((s, i) => (
              <motion.button key={s.ticker}
                initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => onSelectTicker(s.ticker)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl transition-colors"
      style={{ background: 'var(--bg-card)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <div className="text-left">
                  <p className="text-xs font-bold" style={{ color: 'var(--text)' }}>{s.ticker}</p>
                  <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{fmtPrice(s.price)}</p>
                </div>
                <span className="text-xs font-mono font-bold text-emerald-500">
                  +{s.changePct.toFixed(2)}%
                </span>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Losers */}
        <div>
          <p className="text-xs font-semibold text-red-400 mb-2">Top Losers</p>
          <div className="space-y-1.5">
            {losers.map((s, i) => (
              <motion.button key={s.ticker}
                initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => onSelectTicker(s.ticker)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl transition-colors"
      style={{ background: 'var(--bg-card)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <div className="text-left">
                  <p className="text-xs font-bold" style={{ color: 'var(--text)' }}>{s.ticker}</p>
                  <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{fmtPrice(s.price)}</p>
                </div>
                <span className="text-xs font-mono font-bold text-red-400">
                  {s.changePct.toFixed(2)}%
                </span>
              </motion.button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
