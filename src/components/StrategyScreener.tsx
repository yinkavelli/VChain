import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronUp, BarChart2, Loader2, AlertTriangle } from 'lucide-react'
import { useStrategyScreener, useRescan, type StrategyScreenResult } from '../hooks/useStrategyScreener'
import type { Thesis } from '../lib/strategyScorer'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

interface Props {
  spotPrices: Record<string, number>
  onSelectTicker: (ticker: string) => void
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
  const low  = spot * 0.75
  const high = spot * 1.25
  const steps = 50
  return Array.from({ length: steps + 1 }, (_, i) => {
    const price = low + (i / steps) * (high - low)
    let pnl = 0
    for (const leg of s.legs) {
      const K = leg.contract.details.strike_price
      const type = leg.contract.details.contract_type
      let intrinsic = type === 'call' ? Math.max(0, price - K) : Math.max(0, K - price)
      const legPnl = leg.action === 'SELL'
        ? (leg.price - intrinsic) * 100
        : (intrinsic - leg.price) * 100
      pnl += legPnl
    }
    return { price: +price.toFixed(2), pnl: +pnl.toFixed(2) }
  })
}

function StrategyCard({ s, spot, onSelectTicker }: {
  s: StrategyScreenResult
  spot: number
  onSelectTicker: (t: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const tc = thesisColor(s.thesis)
  const payoff = buildPayoffData(s, spot)
  const pnlColor = s.maxProfit > 0 ? '#10b981' : '#f59e0b'

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
              <button onClick={() => onSelectTicker(s.ticker)}
                className="text-sm font-bold hover:underline" style={{ color: 'var(--text)' }}>
                {s.ticker}
              </button>
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
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { label: 'PoP', value: `${s.pop}%`, color: s.pop > 65 ? '#10b981' : '#f59e0b' },
            { label: 'Yield/yr', value: s.premiumYield > 0 ? `${s.premiumYield.toFixed(0)}%` : '—', color: '#6366f1' },
            { label: 'IVR', value: s.ivRank > 0 ? String(s.ivRank) : '~', color: s.ivRank > 50 ? '#10b981' : '#94a3b8' },
            { label: 'IV/HV', value: s.ivHvRatio > 0 ? `${s.ivHvRatio.toFixed(2)}×` : '—', color: s.ivHvRatio > 1.2 ? '#10b981' : '#94a3b8' },
          ].map(m => (
            <div key={m.label} className="rounded-xl px-2 py-1.5 text-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <p className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-muted)' }}>{m.label}</p>
              <p className="text-xs font-bold font-mono" style={{ color: m.color }}>{m.value}</p>
            </div>
          ))}
        </div>

        {/* Leg summary */}
        <div className="space-y-1 mb-3">
          {s.legs.map((leg, i) => (
            <div key={i} className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-2">
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${leg.action === 'SELL' ? 'bg-red-900/50 text-red-300' : 'bg-emerald-900/50 text-emerald-300'}`}>
                  {leg.action}
                </span>
                <span style={{ color: 'var(--text-sub)' }}>
                  ${leg.contract.details.strike_price} {leg.contract.details.contract_type.toUpperCase()} · {leg.contract.details.expiration_date.slice(5)} · {s.dte}d
                </span>
              </div>
              <span className="font-mono" style={{ color: 'var(--text-muted)' }}>${leg.price.toFixed(3)}</span>
            </div>
          ))}
        </div>

        {/* P&L summary + expand */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-[11px]">
            <span className="text-emerald-400 font-mono">
              Max profit: {s.maxProfit === Infinity ? '∞' : `$${(s.maxProfit * 100).toFixed(0)}`}
            </span>
            <span className="text-red-400 font-mono">
              Max loss: {s.maxLoss === Infinity ? '∞' : `-$${(s.maxLoss * 100).toFixed(0)}`}
            </span>
          </div>
          <button onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg transition-colors"
            style={{ color: 'var(--accent)', background: 'rgba(99,102,241,0.1)' }}>
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Payoff
          </button>
        </div>
      </div>

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
              <div className="flex items-center justify-between text-[10px]">
                <span style={{ color: 'var(--text-muted)' }}>
                  Breakeven{s.breakevens.length > 1 ? 's' : ''}: {s.breakevens.map(b => `$${b.toFixed(2)}`).join(' / ')}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>
                  Expected ±{s.expectedMovePct.toFixed(1)}% ({s.dte}d)
                </span>
              </div>
              <ResponsiveContainer width="100%" height={130}>
                <AreaChart data={payoff} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`grad-${s.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={pnlColor} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={pnlColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="price" tick={{ fontSize: 8, fill: '#64748b' }} tickLine={false} axisLine={false}
                    tickFormatter={v => `$${v}`} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 8, fill: '#64748b' }} tickLine={false} axisLine={false}
                    tickFormatter={v => v >= 0 ? `+$${v}` : `-$${Math.abs(v)}`} width={46} />
                  <Tooltip contentStyle={{ background: '#0d0d20', border: '1px solid #1e1e3f', borderRadius: 8, fontSize: 10 }}
                    formatter={(v) => { const n = Number(v); return [n >= 0 ? `+$${n}` : `-$${Math.abs(n)}`, 'P&L'] }}
                    labelFormatter={v => `Spot $${v}`} />
                  <ReferenceLine y={0} stroke="#334155" strokeDasharray="3 3" />
                  <ReferenceLine x={spot} stroke="#6366f1" strokeWidth={1.5}
                    label={{ value: 'Now', position: 'top', fontSize: 8, fill: '#6366f1' }} />
                  {s.breakevens.map((b, i) => (
                    <ReferenceLine key={i} x={+b.toFixed(2)} stroke="#f59e0b" strokeDasharray="3 2"
                      label={{ value: 'BE', position: 'insideTopRight', fontSize: 7, fill: '#f59e0b' }} />
                  ))}
                  <Area type="monotone" dataKey="pnl" stroke={pnlColor} strokeWidth={2}
                    fill={`url(#grad-${s.id})`} dot={false} />
                </AreaChart>
              </ResponsiveContainer>

              {/* Expected move visual */}
              <div className="flex items-center gap-2 text-[10px]">
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div className="h-full rounded-full" style={{
                    width: `${Math.min(100, s.expectedMovePct * 4)}%`,
                    background: 'linear-gradient(90deg,#6366f1,#7c3aed)'
                  }} />
                </div>
                <span style={{ color: 'var(--text-muted)' }}>1-SD: ±${s.expectedMove.toFixed(2)} ({s.expectedMovePct.toFixed(1)}%)</span>
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

const SCORING_NOTES = [
  { label: 'PoP', desc: 'Probability of Profit — derived from option delta. 70% means 7 in 10 chance the trade expires profitable.' },
  { label: 'Yield/yr', desc: 'Annualised return on capital at risk. A CSP collecting $2 on $98 collateral for 30 days = ~24% annualised.' },
  { label: 'IVR', desc: 'IV Rank — where current IV sits vs recent history. Above 50 = elevated premium, good for selling. Below 30 = cheap vol, good for buying.' },
  { label: 'IV/HV', desc: 'IV divided by Historical Vol. Above 1.2× means options are pricing more movement than recently realised — edge for premium sellers.' },
  { label: 'Score', desc: 'Composite 0–100. Weights: IV Rank 25%, IV/HV ratio 25%, annualised yield 25%, PoP 15%, DTE sweet spot 10%.' },
]

export function StrategyScreener({ spotPrices, onSelectTicker }: Props) {
  const [thesis, setThesis]       = useState<Thesis | 'All'>('All')
  const [minScore, setMinScore]   = useState(50)
  const [showScoring, setScoring] = useState(false)

  const [scanMsg, setScanMsg] = useState('')
  const { data: strategies = [], isLoading, dataUpdatedAt } = useStrategyScreener(spotPrices, thesis, minScore)
  const rescan = useRescan()

  const filtered = strategies.filter(s => thesis === 'All' || s.thesis === thesis)

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
          {!isLoading && !rescan.isPending && (
            <button onClick={() => rescan.mutate(undefined, {
              onSuccess: (d) => setScanMsg(`✓ Saved ${d.saved ?? 0}`),
              onError: (e) => setScanMsg(`✗ ${e.message}`),
            })}
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
            Analysing options chains across {'{'}35{'}'} stocks…
          </p>
        </div>
      )}

      {/* Strategy cards */}
      {!isLoading && filtered.length === 0 && (
        <div className="rounded-2xl p-10 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <BarChart2 className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>No plays at this score threshold</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Try lowering the min score or changing the thesis filter</p>
        </div>
      )}

      {!isLoading && (
        <div className="space-y-3">
          {filtered.slice(0, 20).map(s => (
            <StrategyCard
              key={s.id}
              s={s}
              spot={spotPrices[s.ticker] ?? 0}
              onSelectTicker={onSelectTicker}
            />
          ))}
        </div>
      )}
    </div>
  )
}
