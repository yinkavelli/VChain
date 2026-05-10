import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronUp, BarChart2, Loader2, AlertTriangle, Sparkles, Calendar, DollarSign, Star } from 'lucide-react'
import { useStrategyScreener, useRescan, type StrategyScreenResult } from '../hooks/useStrategyScreener'
import { useTickerEnrichment, type TickerEnrichment } from '../hooks/useTickerEnrichment'
import { useWatchlist, useToggleWatchlist } from '../hooks/useWatchlist'
import type { Thesis } from '../lib/strategyScorer'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, ReferenceArea } from 'recharts'
import type { User } from '@supabase/supabase-js'

interface Props {
  spotPrices: Record<string, number>
  onSelectTicker: (ticker: string) => void
  onTrade: (s: StrategyScreenResult) => void
  user: User | null
}

function daysUntil(dateStr: string): number {
  return Math.round((new Date(dateStr).getTime() - Date.now()) / 86_400_000)
}

const THESIS_TABS: (Thesis | 'All')[] = ['All', 'Sell Premium', 'Bullish', 'Bearish', 'Buy Vol', 'Neutral']

const thesisColor = (t: Thesis | string) => {
  if (t === 'Sell Premium') return { bg: 'rgba(99,102,241,0.15)', border: 'rgba(99,102,241,0.4)', text: '#a5b4fc' }
  if (t === 'Bullish')      return { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.35)', text: '#6ee7b7' }
  if (t === 'Bearish')      return { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.35)',  text: '#fca5a5' }
  if (t === 'Buy Vol')      return { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)', text: '#fcd34d' }
  return { bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.2)', text: '#c4b5fd' }
}

const scoreColor = (s: number) =>
  s >= 75 ? '#10b981' : s >= 60 ? '#f59e0b' : '#6366f1'

function ScoreRing({ score }: { score: number }) {
  const r = 18, c = 2 * Math.PI * r
  const filled = (score / 100) * c
  return (
    <div className="relative w-12 h-12 flex-shrink-0">
      <svg width="48" height="48" viewBox="0 0 48 48" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(180,185,200,0.25)" strokeWidth="3" />
        <circle cx="24" cy="24" r={r} fill="none" stroke={scoreColor(score)} strokeWidth="3"
          strokeDasharray={`${filled} ${c}`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[11px] font-bold font-mono" style={{ color: scoreColor(score) }}>{score}</span>
      </div>
    </div>
  )
}

function buildPayoffData(s: StrategyScreenResult, spot: number) {
  const low  = spot * 0.70
  const high = spot * 1.30
  const steps = 50
  return Array.from({ length: steps + 1 }, (_, i) => {
    const price = low + (i / steps) * (high - low)
    let pnl = 0
    for (const leg of s.legs) {
      // Support both DB format (strike/type) and live format (contract.details)
      const K    = (leg as any).strike ?? leg.contract?.details?.strike_price ?? 0
      const type = ((leg as any).type ?? leg.contract?.details?.contract_type ?? 'call').toLowerCase()
      const intrinsic = type === 'call' ? Math.max(0, price - K) : Math.max(0, K - price)
      pnl += leg.action === 'SELL'
        ? (leg.price - intrinsic) * 100
        : (intrinsic - leg.price) * 100
    }
    return { price: +price.toFixed(2), pnl: +pnl.toFixed(2) }
  })
}

function StrategyCard({ s, spot, onTrade }: {
  s: StrategyScreenResult
  spot: number
  onTrade: (s: StrategyScreenResult) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [rationaleOpen, setRationaleOpen] = useState(false)
  const rationaleCache = useRef<string | null>(null)
  const [rationaleText, setRationaleText] = useState<string | null>(null)
  const [rationaleLoading, setRationaleLoading] = useState(false)
  const [rationaleError, setRationaleError] = useState<string | null>(null)
  const tc = thesisColor(s.thesis)

  async function handleRationaleToggle() {
    if (rationaleOpen) {
      setRationaleOpen(false)
      return
    }
    setRationaleOpen(true)
    // Already cached — skip fetch
    if (rationaleCache.current !== null) {
      setRationaleText(rationaleCache.current)
      return
    }
    setRationaleLoading(true)
    setRationaleError(null)
    setRationaleText(null)
    try {
      const res = await fetch('/api/rationale', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Rationale-Key': import.meta.env.VITE_CRON_SECRET ?? '',
        },
        body: JSON.stringify({
          ticker:      s.ticker,
          strategy:    s.type,
          iv_rank:     s.ivRank,
          iv_hv_ratio: s.ivHvRatio,
          price_trend: s.thesis,
          dte:         s.dte,
        }),
      })
      const json = await res.json() as { rationale?: string; error?: string }
      if (!res.ok || json.error) throw new Error(json.error ?? 'Failed to fetch rationale')
      const text = json.rationale ?? ''
      rationaleCache.current = text
      setRationaleText(text)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setRationaleError(msg)
    } finally {
      setRationaleLoading(false)
    }
  }
  const payoff = buildPayoffData(s, spot)
  const pnlColor = s.maxProfit > 0 ? '#10b981' : '#f59e0b'
  const ivLow    = +(spot - s.expectedMove).toFixed(2)
  const ivHigh   = +(spot + s.expectedMove).toFixed(2)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl overflow-hidden"
      style={{ background: `linear-gradient(135deg, ${tc.bg} 0%, rgba(13,13,32,0.97) 100%)`, border: `1px solid ${tc.border}` }}>

      {/* Main row */}
      <div className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <ScoreRing score={s.score} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: tc.bg, border: `1px solid ${tc.border}`, color: tc.text }}>
                {s.type}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ color: tc.text, background: tc.bg }}>
                {s.thesis}
              </span>
            </div>
            <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>{s.edge}</p>
          </div>
        </div>


        {/* Key metrics */}
        <div className="grid grid-cols-4 gap-1.5 mb-3">
          {[
            { label: 'PoP',      value: `${s.pop}%`,                                                color: s.pop > 65 ? '#10b981' : '#f59e0b' },
            { label: 'Yield/yr', value: s.premiumYield > 0 ? `${s.premiumYield.toFixed(0)}%` : '—', color: '#6366f1' },
            { label: 'Max Profit', value: s.maxProfit === Infinity ? '∞' : `$${(s.maxProfit * 100).toFixed(0)}`, color: '#10b981' },
            { label: 'Max Loss',   value: s.maxLoss   === Infinity ? '∞' : `-$${(s.maxLoss * 100).toFixed(0)}`,  color: '#ef4444' },
          ].map(m => (
            <div key={m.label} className="rounded-xl px-2 py-1.5 text-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <p className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-muted)' }}>{m.label}</p>
              <p className="text-xs font-bold font-mono" style={{ color: m.color }}>{m.value}</p>
            </div>
          ))}
        </div>

        {/* Leg summary */}
        <div className="space-y-1 mb-3 font-mono text-[11px]">
          {s.legs.map((leg, i) => {
            const strike = (leg as any).strike ?? leg.contract?.details?.strike_price ?? 0
            const type   = ((leg as any).type ?? leg.contract?.details?.contract_type ?? '').toUpperCase()
            const expiry = ((leg as any).expiry ?? leg.contract?.details?.expiration_date ?? '').slice(5)
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2.5rem 5rem 3.5rem 2rem 1fr', alignItems: 'center', gap: '0.375rem' }}>
                <span className={`inline-flex items-center justify-center rounded text-[9px] font-bold py-0.5 ${leg.action === 'SELL' ? 'bg-red-900/50 text-red-300' : 'bg-emerald-900/50 text-emerald-300'}`}>
                  {leg.action}
                </span>
                <span style={{ color: 'var(--text-sub)' }}>${strike} {type}</span>
                <span style={{ color: 'var(--text-muted)' }}>{expiry}</span>
                <span style={{ color: 'var(--text-muted)' }}>{s.dte}d</span>
                <span className="text-right" style={{ color: 'var(--text-muted)' }}>${leg.price.toFixed(3)}</span>
              </div>
            )
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end">
          <div className="flex items-center gap-2">
            <button onClick={() => onTrade(s)}
              className="text-[11px] font-semibold px-2.5 py-1 rounded-lg"
              style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7' }}>
              Trade
            </button>
            <button onClick={handleRationaleToggle}
              className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg transition-colors"
              style={rationaleOpen
                ? { color: '#fbbf24', background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)' }
                : { color: '#a78bfa', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }
              }>
              <Sparkles className="w-3 h-3" />
              AI
            </button>
            <button onClick={() => setExpanded(e => !e)}
              className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg transition-colors"
              style={{ color: 'var(--accent)', background: 'rgba(99,102,241,0.1)' }}>
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              Payoff
            </button>
          </div>
        </div>
      </div>

      {/* AI Rationale panel */}
      <AnimatePresence>
        {rationaleOpen && (
          <motion.div
            key="rationale"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden border-t"
            style={{ borderColor: 'rgba(139,92,246,0.25)' }}>
            <div className="px-4 py-3" style={{ background: 'rgba(139,92,246,0.05)' }}>
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles className="w-3 h-3" style={{ color: '#a78bfa' }} />
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#a78bfa' }}>
                  AI Rationale
                </span>
              </div>
              {rationaleLoading && (
                <div className="flex items-center gap-2 py-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: '#a78bfa' }} />
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Analysing signals…</span>
                </div>
              )}
              {rationaleError && !rationaleLoading && (
                <div className="flex items-center gap-1.5 text-[11px]" style={{ color: '#f87171' }}>
                  <AlertTriangle className="w-3 h-3" />
                  {rationaleError}
                </div>
              )}
              {rationaleText && !rationaleLoading && (
                <motion.p
                  key={rationaleText}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                  className="text-[12px] leading-relaxed"
                  style={{ color: 'var(--text-sub)' }}>
                  {rationaleText}
                </motion.p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expandable payoff diagram */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t"
            style={{ borderColor: tc.border }}>
            <div className="p-4 space-y-3">
              {/* Breakeven row */}
              <div className="flex items-center justify-between text-[10px]">
                <span style={{ color: 'var(--text-muted)' }}>
                  BE: {s.breakevens.map(b => `$${b.toFixed(2)}`).join(' / ')}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>← scroll →</span>
              </div>

              {/* Horizontally scrollable chart */}
              <div className="overflow-x-auto no-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
                <div style={{ width: 800, height: 140 }}>
                  <AreaChart width={800} height={140} data={payoff} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id={`grad-${s.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={pnlColor} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={pnlColor} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="price" tick={{ fontSize: 8, fill: '#64748b' }} tickLine={false} axisLine={false}
                      tickFormatter={v => `$${v}`} interval={4} />
                    <YAxis tick={{ fontSize: 8, fill: '#64748b' }} tickLine={false} axisLine={false}
                      tickFormatter={v => v >= 0 ? `+$${v}` : `-$${Math.abs(v)}`} width={46} />
                    <Tooltip contentStyle={{ background: '#0d0d20', border: '1px solid #1e1e3f', borderRadius: 8, fontSize: 10 }}
                      formatter={(v) => { const n = Number(v); return [n >= 0 ? `+$${n}` : `-$${Math.abs(n)}`, 'P&L'] }}
                      labelFormatter={v => `Spot $${v}`} />
                    <ReferenceArea x1={ivLow} x2={ivHigh} fill="rgba(99,102,241,0.18)" stroke="rgba(99,102,241,0.45)" strokeDasharray="4 2" />
                    <ReferenceLine y={0} stroke="#334155" strokeDasharray="3 3" />
                    <ReferenceLine x={spot} stroke="#6366f1" strokeWidth={1.5}
                      label={{ value: `$${spot.toFixed(0)}`, position: 'top', fontSize: 8, fill: '#6366f1' }} />
                    {s.breakevens.map((b, i) => (
                      <ReferenceLine key={i} x={+b.toFixed(2)} stroke="#f59e0b" strokeDasharray="3 2"
                        label={{ value: 'BE', position: 'insideTopRight', fontSize: 7, fill: '#f59e0b' }} />
                    ))}
                    <Area type="monotone" dataKey="pnl" stroke={pnlColor} strokeWidth={2}
                      fill={`url(#grad-${s.id})`} dot={false} />
                  </AreaChart>
                </div>
              </div>

              {/* IV band legend */}
              <div className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm" style={{ background: 'rgba(99,102,241,0.25)', border: '1px dashed rgba(99,102,241,0.5)' }} />
                  <span style={{ color: 'var(--text-muted)' }}>
                    IV range: ${ivLow} – ${ivHigh} <span className="opacity-60">(±{s.expectedMovePct.toFixed(1)}% 1SD)</span>
                  </span>
                </div>
                <span style={{ color: 'var(--text-muted)' }}>{s.dte}d to expiry</span>
              </div>

              {/* Warning for EOD data */}
              <div className="flex items-center gap-1.5 text-[9px]" style={{ color: 'var(--text-muted)' }}>
                <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
                Prices use prev-day close. Upgrade to Developer for live quotes.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function Sparkline({ closes, width = 80, height = 36 }: { closes: number[]; width?: number; height?: number }) {
  if (closes.length < 2) return null
  const min = Math.min(...closes)
  const max = Math.max(...closes)
  const range = max - min || 1
  const pts = closes.map((c, i) => {
    const x = (i / (closes.length - 1)) * width
    const y = height - ((c - min) / range) * height
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const rising = closes[closes.length - 1] >= closes[0]
  const color  = rising ? '#10b981' : '#ef4444'
  return (
    <svg width={width} height={height} style={{ display: 'block', flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function timeAgo(utc: string): string {
  const diff = (Date.now() - new Date(utc).getTime()) / 1000
  if (diff < 3600)  return `${Math.round(diff / 60)}m ago`
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
  return `${Math.round(diff / 86400)}d ago`
}

function TickerGroup({ ticker, strategies, spot, enrichment, watched, onSelectTicker, onTrade, onToggleWatch }: {
  ticker: string
  strategies: StrategyScreenResult[]
  spot: number
  enrichment?: TickerEnrichment
  watched: boolean
  onSelectTicker: (t: string) => void
  onTrade: (s: StrategyScreenResult) => void
  onToggleWatch: (ticker: string, watched: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const best = strategies[0]
  const rsi = enrichment?.rsi ?? null
  const earningsDays = enrichment?.earningsDate ? daysUntil(enrichment.earningsDate) : null
  const earningsInWindow = earningsDays !== null && earningsDays >= 0 && earningsDays <= (best?.dte ?? 45)
  const divDays = enrichment?.dividend?.exDate ? daysUntil(enrichment.dividend.exDate) : null
  const divInWindow = divDays !== null && divDays >= 0 && divDays <= (best?.dte ?? 45)
  const sparkline = enrichment?.sparkline ?? []
  const news = enrichment?.news ?? []

  const ivMetrics = [
    best && best.ivRank > 0    ? { label: 'IVR',   value: String(best.ivRank),             color: best.ivRank > 50 ? '#10b981' : '#94a3b8' } : null,
    best && best.ivHvRatio > 0 ? { label: 'IV/HV', value: `${best.ivHvRatio.toFixed(2)}×`, color: best.ivHvRatio > 1.2 ? '#10b981' : '#94a3b8' } : null,
    rsi !== null               ? { label: 'RSI',   value: rsi.toFixed(0),                  color: rsi > 70 ? '#ef4444' : rsi < 30 ? '#10b981' : '#f59e0b' } : null,
  ].filter(Boolean) as { label: string; value: string; color: string }[]

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      {/* Group header — always visible */}
      <button className="w-full text-left px-4 pt-3 pb-2" onClick={() => setOpen(o => !o)}
        style={{ background: 'rgba(99,102,241,0.04)' }}>

        {/* Row 1: ticker identity + metrics + sparkline + play count */}
        <div className="flex items-start justify-between gap-2">
          {/* Left: ticker name block */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-sm font-bold" style={{ color: 'var(--text)' }}
                onClick={e => { e.stopPropagation(); onSelectTicker(ticker) }}>
                {ticker}
              </span>
              <span onClick={e => { e.stopPropagation(); onToggleWatch(ticker, watched) }}>
                <Star className="w-3.5 h-3.5" fill={watched ? '#f59e0b' : 'none'}
                  style={{ color: watched ? '#f59e0b' : 'var(--text-muted)' }} />
              </span>
              {spot > 0 && (
                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-sub)' }}>
                  ${spot.toFixed(2)}
                </span>
              )}
            </div>
            {enrichment?.companyName && (
              <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                {enrichment.companyName}
              </p>
            )}
          </div>

          {/* Centre: metric cards + sparkline */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {ivMetrics.map(m => (
              <div key={m.label} className="rounded-lg px-2 py-1 text-center"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-[8px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{m.label}</p>
                <p className="text-[11px] font-bold font-mono leading-tight" style={{ color: m.color }}>{m.value}</p>
              </div>
            ))}
            {sparkline.length >= 2 && <Sparkline closes={sparkline} width={72} height={32} />}
          </div>

          {/* Right: play count + chevron */}
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>
              {strategies.length} {strategies.length === 1 ? 'play' : 'plays'}
            </span>
            {open ? <ChevronUp className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                  : <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />}
          </div>
        </div>

        {/* Row 2: event badges */}
        {(earningsInWindow || divInWindow) && (
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {earningsInWindow && (
              <span className="flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)', color: '#fcd34d' }}>
                <Calendar className="w-2.5 h-2.5" />
                Earnings {earningsDays === 0 ? 'today' : `in ${earningsDays}d`}
              </span>
            )}
            {divInWindow && (
              <span className="flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7' }}>
                <DollarSign className="w-2.5 h-2.5" />
                Ex-div {divDays === 0 ? 'today' : `in ${divDays}d`}
              </span>
            )}
          </div>
        )}

        {/* Row 3: top news headlines */}
        {news.length > 0 && (
          <div className="mt-2 space-y-1">
            {news.slice(0, 2).map(n => (
              <a key={n.id} href={n.article_url} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="flex items-start gap-1.5 group">
                <span className="text-[9px] mt-0.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>▸</span>
                <p className="text-[10px] leading-snug group-hover:underline truncate"
                  style={{ color: 'var(--text-sub)' }}>
                  {n.title}
                </p>
                <span className="text-[9px] flex-shrink-0 ml-auto pl-1" style={{ color: 'var(--text-muted)' }}>
                  {timeAgo(n.published_utc)}
                </span>
              </a>
            ))}
          </div>
        )}
      </button>

      {/* Strategy cards — collapsible */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden">
            <div className="px-3 pb-3 pt-1 space-y-2">
              {strategies.map(s => (
                <StrategyCard key={s.id} s={s} spot={spot} onTrade={onTrade} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const SCORING_NOTES = [
  { label: 'PoP', desc: 'Probability of Profit — derived from option delta. 70% means 7 in 10 chance the trade expires profitable.' },
  { label: 'Yield/yr', desc: 'Annualised return on capital at risk. A CSP collecting $2 on $98 collateral for 30 days = ~24% annualised.' },
  { label: 'IVR', desc: 'IV Rank — where current IV sits vs recent history. Above 50 = elevated premium, good for selling. Below 30 = cheap vol, good for buying.' },
  { label: 'IV/HV', desc: 'IV divided by Historical Vol. Above 1.2× means options are pricing more movement than recently realised — edge for premium sellers.' },
  { label: 'Score', desc: 'Composite 0–100. Weights: IV Rank 25%, IV/HV ratio 25%, annualised yield 25%, PoP 15%, DTE sweet spot 10%.' },
]

export function StrategyScreener({ spotPrices, onSelectTicker, onTrade, user }: Props) {
  const [thesis, setThesis]         = useState<Thesis | 'All'>('All')
  const [minScore, setMinScore]     = useState(50)
  const [showScoring, setScoring]   = useState(false)
  const [watchlistOnly, setWatchlistOnly] = useState(false)

  const { data: strategies = [], isLoading, dataUpdatedAt } = useStrategyScreener(spotPrices, thesis, minScore)
  const rescan = useRescan()
  const { data: watchlist = [] } = useWatchlist(user?.id)
  const toggleWatch = useToggleWatchlist(user?.id)

  const filtered = strategies.filter(s =>
    (thesis === 'All' || s.thesis === thesis) &&
    s.score >= minScore &&
    (!watchlistOnly || watchlist.includes(s.ticker))
  )
  const visibleTickers = [...new Set(filtered.slice(0, 40).map(s => s.ticker))]
  const { data: enrichmentMap } = useTickerEnrichment(visibleTickers)
  const scanMsg = rescan.isSuccess
    ? `✓ Saved ${(rescan.data as any)?.saved ?? 0}`
    : rescan.isError
    ? `✗ ${(rescan.error as Error)?.message ?? 'Failed'}`
    : ''

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Strategy Screener</h2>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {isLoading || rescan.isPending
              ? 'Scanning 20 stocks…'
              : `${filtered.length} plays · score ≥ ${minScore}`}
            {!isLoading && !rescan.isPending && strategies[0]?.scannedAt
              ? ` · from DB · ${new Date(strategies[0].scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : !isLoading && !rescan.isPending && dataUpdatedAt
              ? ` · live · ${new Date(dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {scanMsg && (
            <span className="text-[11px] font-medium" style={{ color: scanMsg.startsWith('✓') ? '#10b981' : '#ef4444' }}>
              {scanMsg}
            </span>
          )}
          {(isLoading || rescan.isPending) && <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--accent)' }} />}
          {user && (
            <button onClick={() => setWatchlistOnly(w => !w)}
              className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-xl font-medium"
              style={watchlistOnly
                ? { background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', color: '#fcd34d' }
                : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}>
              <Star className="w-3 h-3" fill={watchlistOnly ? '#fcd34d' : 'none'}
                style={{ color: watchlistOnly ? '#fcd34d' : 'var(--text-muted)' }} />
              {watchlistOnly ? `Watchlist (${watchlist.length})` : 'Watchlist'}
            </button>
          )}
          {!isLoading && !rescan.isPending && (
            <button onClick={() => rescan.mutate()}
              className="text-[11px] px-2.5 py-1.5 rounded-xl font-medium"
              style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: 'var(--accent)' }}>
              Rescan
            </button>
          )}
        </div>
      </div>

      {/* Scoring explainer */}
      <div>
        <button onClick={() => setScoring(s => !s)}
          className="text-[11px] flex items-center gap-1.5 font-medium"
          style={{ color: 'var(--text-muted)' }}>
          <span style={{ color: 'var(--accent)' }}>{showScoring ? '▾' : '▸'}</span>
          How scoring works
        </button>
        {showScoring && (
          <div className="mt-2 rounded-2xl p-3 space-y-2"
            style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
            {SCORING_NOTES.map(n => (
              <div key={n.label} className="flex gap-2 text-[11px]">
                <span className="font-bold flex-shrink-0 w-14" style={{ color: 'var(--accent)' }}>{n.label}</span>
                <span style={{ color: 'var(--text-sub)' }}>{n.desc}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Thesis filter */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        {THESIS_TABS.map(t => {
          const tc = t === 'All' ? { border: 'rgba(99,102,241,0.4)', text: '#a5b4fc', bg: 'rgba(99,102,241,0.15)' } : thesisColor(t)
          const active = thesis === t
          return (
            <button key={t} onClick={() => setThesis(t)}
              className="flex-shrink-0 text-[11px] px-3 py-1.5 rounded-full font-semibold transition-all"
              style={active
                ? { background: tc.bg, border: `1px solid ${tc.border}`, color: tc.text }
                : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)' }
              }>
              {t}
            </button>
          )
        })}
      </div>

      {/* Score filter */}
      <div className="flex items-center gap-3 px-1">
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Min score</span>
        {[50, 60, 70, 80].map(s => (
          <button key={s} onClick={() => setMinScore(s)}
            className="text-[11px] px-2.5 py-1 rounded-lg font-semibold transition-all"
            style={minScore === s
              ? { background: 'var(--accent)', color: '#fff' }
              : { background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.08)' }
            }>
            {s}+
          </button>
        ))}
        <span className="text-[10px] ml-auto" style={{ color: 'var(--text-muted)' }}>
          {filtered.length} plays
        </span>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="h-40 rounded-2xl animate-pulse" style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.12)' }} />
          ))}
          <p className="text-center text-xs py-2" style={{ color: 'var(--text-muted)' }}>
            Analysing options chains across {Object.keys(spotPrices).length} stocks…
          </p>
        </div>
      )}

      {/* Strategy cards */}
      {!isLoading && filtered.length === 0 && (
        <div className="rounded-2xl p-10 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          {watchlistOnly && watchlist.length === 0 ? (
            <>
              <Star className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Your watchlist is empty</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Star any ticker on a strategy card to add it</p>
            </>
          ) : (
            <>
              <BarChart2 className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>
                {watchlistOnly ? 'No strategies for your watchlist tickers' : 'No plays at this score threshold'}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {watchlistOnly ? 'Try lowering the min score or rescanning' : 'Try lowering the min score or changing the thesis filter'}
              </p>
            </>
          )}
        </div>
      )}

      {!isLoading && (() => {
        // Group filtered strategies by ticker, preserving best-score order
        const groups = new Map<string, StrategyScreenResult[]>()
        for (const s of filtered.slice(0, 40)) {
          if (!groups.has(s.ticker)) groups.set(s.ticker, [])
          groups.get(s.ticker)!.push(s)
        }
        return (
          <div className="space-y-3">
            {[...groups.entries()].map(([ticker, strats]) => (
              <TickerGroup
                key={ticker}
                ticker={ticker}
                strategies={strats}
                spot={spotPrices[ticker] ?? 0}
                enrichment={enrichmentMap?.[ticker]}
                watched={watchlist.includes(ticker)}
                onSelectTicker={onSelectTicker}
                onTrade={onTrade}
                onToggleWatch={(t, w) => toggleWatch.mutate({ ticker: t, watched: w })}
              />
            ))}
          </div>
        )
      })()}
    </div>
  )
}
