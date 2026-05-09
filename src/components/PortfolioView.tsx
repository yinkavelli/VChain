import { useState } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Clock, CheckCircle, LogIn } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import type { User } from '@supabase/supabase-js'
import { useTrades, useCloseTrade } from '../hooks/useTrades'
import type { Trade } from '../lib/supabase'

interface Props {
  user: User | null
  spotPrices: Record<string, number>
  onSignIn: () => void
}

function calcPnl(trade: Trade, markPrices: Record<string, number>): number {
  const mark = markPrices[trade.ticker] ?? trade.entry_price
  const diff = trade.side === 'BUY' ? mark - trade.entry_price : trade.entry_price - mark
  return diff * trade.quantity * 100
}

function buildPayoff(trade: Trade, spot: number) {
  const K    = trade.strike_price
  const low  = spot * 0.75
  const high = spot * 1.25
  return Array.from({ length: 51 }, (_, i) => {
    const price     = low + (i / 50) * (high - low)
    const intrinsic = trade.option_side === 'call' ? Math.max(0, price - K) : Math.max(0, K - price)
    const pnl       = trade.side === 'BUY'
      ? (intrinsic - trade.entry_price) * trade.quantity * 100
      : (trade.entry_price - intrinsic) * trade.quantity * 100
    return { price: +price.toFixed(2), pnl: +pnl.toFixed(2) }
  })
}

function OpenCard({ trade, spot, onClose }: { trade: Trade; spot: number; onClose: (id: string, exitPrice: number) => void }) {
  const [expanded, setExpanded] = useState(false)
  const pnl        = calcPnl(trade, { [trade.ticker]: spot })
  const pnlPct     = (pnl / (trade.entry_price * trade.quantity * 100)) * 100
  const isProfit   = pnl >= 0
  const payoff     = expanded ? buildPayoff(trade, spot) : []
  const pnlColor   = isProfit ? '#10b981' : '#ef4444'

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>{trade.ticker}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase"
                style={{ background: trade.option_side === 'call' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: trade.option_side === 'call' ? '#6ee7b7' : '#fca5a5' }}>
                {trade.option_side}
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase"
                style={{ background: trade.side === 'BUY' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: trade.side === 'BUY' ? '#6ee7b7' : '#fca5a5' }}>
                {trade.side}
              </span>
            </div>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              ${trade.strike_price} · {trade.expiry_date.slice(5)} · {trade.quantity} contract{trade.quantity > 1 ? 's' : ''}
            </p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1 justify-end">
              {isProfit ? <TrendingUp className="w-3 h-3" style={{ color: pnlColor }} /> : <TrendingDown className="w-3 h-3" style={{ color: pnlColor }} />}
              <span className="text-sm font-bold font-mono" style={{ color: pnlColor }}>
                {isProfit ? '+' : ''}${pnl.toFixed(0)}
              </span>
            </div>
            <span className="text-[10px] font-mono" style={{ color: pnlColor }}>
              {isProfit ? '+' : ''}{pnlPct.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Entry', value: `$${trade.entry_price.toFixed(3)}` },
            { label: 'Mark',  value: `$${(trade.entry_price + (isProfit ? Math.abs(pnl) : -Math.abs(pnl)) / (trade.quantity * 100)).toFixed(3)}` },
            { label: 'Qty',   value: `${trade.quantity}` },
          ].map(m => (
            <div key={m.label} className="rounded-xl p-2 text-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <p className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-muted)' }}>{m.label}</p>
              <p className="text-xs font-mono font-semibold" style={{ color: 'var(--text)' }}>{m.value}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button onClick={() => setExpanded(e => !e)}
            className="flex-1 py-2 rounded-xl text-[11px] font-medium transition-colors"
            style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: 'var(--accent)' }}>
            {expanded ? 'Hide' : 'Payoff diagram'}
          </button>
          <button onClick={() => onClose(trade.id, trade.entry_price + (pnl / (trade.quantity * 100)))}
            className="flex-1 py-2 rounded-xl text-[11px] font-medium"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
            Close position
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4">
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={payoff} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`pg-${trade.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={pnlColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={pnlColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="price" tick={{ fontSize: 8, fill: '#64748b' }} tickLine={false} axisLine={false}
                tickFormatter={v => `$${v}`} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 8, fill: '#64748b' }} tickLine={false} axisLine={false}
                tickFormatter={v => v >= 0 ? `+$${v}` : `-$${Math.abs(v)}`} width={42} />
              <Tooltip contentStyle={{ background: '#0d0d20', border: '1px solid #1e1e3f', borderRadius: 8, fontSize: 10 }}
                formatter={(v: any) => [v >= 0 ? `+$${v}` : `-$${Math.abs(v)}`, 'P&L at expiry']}
                labelFormatter={v => `Spot $${v}`} />
              <ReferenceLine y={0} stroke="#334155" strokeDasharray="3 3" />
              <ReferenceLine x={spot} stroke="#6366f1" strokeWidth={1.5}
                label={{ value: 'Now', position: 'top', fontSize: 8, fill: '#6366f1' }} />
              <Area type="monotone" dataKey="pnl" stroke={pnlColor} strokeWidth={2}
                fill={`url(#pg-${trade.id})`} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function ClosedCard({ trade }: { trade: Trade }) {
  const pnl      = trade.exit_price != null
    ? (trade.side === 'BUY' ? trade.exit_price - trade.entry_price : trade.entry_price - trade.exit_price) * trade.quantity * 100
    : 0
  const isProfit = pnl >= 0

  return (
    <div className="flex items-center justify-between rounded-xl px-3 py-2.5"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold" style={{ color: 'var(--text)' }}>{trade.ticker}</span>
        <span className="text-[9px] px-1.5 py-0.5 rounded uppercase font-bold"
          style={{ background: trade.option_side === 'call' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: trade.option_side === 'call' ? '#6ee7b7' : '#fca5a5' }}>
          {trade.option_side}
        </span>
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {trade.quantity} × ${trade.entry_price.toFixed(2)}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {trade.exit_time ? new Date(trade.exit_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
        </span>
        <span className="text-xs font-mono font-semibold" style={{ color: isProfit ? '#10b981' : '#ef4444' }}>
          {isProfit ? '+' : ''}${pnl.toFixed(0)}
        </span>
      </div>
    </div>
  )
}

export function PortfolioView({ user, spotPrices, onSignIn }: Props) {
  const [tab, setTab] = useState<'open' | 'history'>('open')
  const { data: trades = [], isLoading } = useTrades(user?.id)
  const closeTrade = useCloseTrade()

  const open   = trades.filter(t => t.status === 'OPEN')
  const closed = trades.filter(t => t.status === 'CLOSED')

  const unrealisedPnl = open.reduce((sum, t) => sum + calcPnl(t, { [t.ticker]: spotPrices[t.ticker] ?? t.entry_price }), 0)
  const realisedPnl   = closed.reduce((sum, t) => {
    if (t.exit_price == null) return sum
    const diff = t.side === 'BUY' ? t.exit_price - t.entry_price : t.entry_price - t.exit_price
    return sum + diff * t.quantity * 100
  }, 0)

  function handleClose(id: string, exitPrice: number) {
    closeTrade.mutate({ id, exit_price: exitPrice })
  }

  if (!user) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Portfolio</h2>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Simulated trade tracking</p>
        </div>
        <div className="rounded-2xl p-8 text-center space-y-4"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center"
            style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }}>
            <LogIn className="w-6 h-6" style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Sign in to track trades</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Book simulated trades from the Strategy Screener and track your paper P&L over time.
            </p>
          </div>
          <button onClick={onSignIn}
            className="w-full py-3 rounded-2xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)' }}>
            Sign in with Google
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Portfolio</h2>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{user.email}</p>
        </div>
        {isLoading && <div className="w-4 h-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Unrealised P&L', value: `${unrealisedPnl >= 0 ? '+' : ''}$${unrealisedPnl.toFixed(0)}`, color: unrealisedPnl >= 0 ? '#10b981' : '#ef4444' },
          { label: 'Realised P&L',   value: `${realisedPnl >= 0 ? '+' : ''}$${realisedPnl.toFixed(0)}`,   color: realisedPnl >= 0 ? '#10b981' : '#ef4444' },
          { label: 'Open positions', value: String(open.length),   color: '#6366f1' },
          { label: 'Closed trades',  value: String(closed.length), color: '#94a3b8' },
        ].map(c => (
          <div key={c.label} className="rounded-2xl p-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <p className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>{c.label}</p>
            <p className="text-base font-bold font-mono" style={{ color: c.color }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Tab toggle */}
      <div className="flex rounded-xl overflow-hidden" style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
        {(['open', 'history'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
            style={tab === t
              ? { background: 'var(--accent)', color: '#fff' }
              : { color: 'var(--text-muted)' }}>
            {t === 'open' ? <Clock className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
            {t === 'open' ? `Open (${open.length})` : `History (${closed.length})`}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'open' ? (
        open.length === 0 ? (
          <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>No open positions</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Book a trade from the Strategy Screener to get started.</p>
          </div>
        ) : (
          <motion.div className="space-y-3">
            {open.map(t => (
              <OpenCard key={t.id} trade={t} spot={spotPrices[t.ticker] ?? t.strike_price} onClose={handleClose} />
            ))}
          </motion.div>
        )
      ) : (
        closed.length === 0 ? (
          <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>No trade history</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Closed trades will appear here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {closed.map(t => <ClosedCard key={t.id} trade={t} />)}
          </div>
        )
      )}
    </div>
  )
}
