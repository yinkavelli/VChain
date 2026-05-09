import { useState } from 'react'
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

function buildPayoff(trade: Trade, spot: number) {
  const legs = trade.strategy_data?.legs ?? []
  const low  = spot * 0.75
  const high = spot * 1.25
  return Array.from({ length: 51 }, (_, i) => {
    const price = low + (i / 50) * (high - low)
    let pnl = 0
    for (const leg of legs) {
      const K         = leg.strike
      const intrinsic = leg.type.toLowerCase() === 'call' ? Math.max(0, price - K) : Math.max(0, K - price)
      pnl += leg.action === 'SELL'
        ? (leg.price - intrinsic) * trade.quantity * 100
        : (intrinsic - leg.price) * trade.quantity * 100
    }
    return { price: +price.toFixed(2), pnl: +pnl.toFixed(2) }
  })
}

function OpenCard({ trade, spot, onClose }: { trade: Trade; spot: number; onClose: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const maxProfit = trade.max_profit * trade.quantity
  const maxLoss   = trade.max_loss   * trade.quantity
  const payoff    = expanded ? buildPayoff(trade, spot) : []
  const legs      = trade.strategy_data?.legs ?? []
  const breakevens = trade.strategy_data?.breakevens ?? []

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>{trade.ticker}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc' }}>
                {trade.strategy_type}
              </span>
            </div>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {trade.quantity} contract{trade.quantity > 1 ? 's' : ''} · {trade.strategy_data?.dte ?? '—'}d DTE · {new Date(trade.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>Max profit / loss</p>
            <p className="text-xs font-mono font-semibold text-emerald-400">+${maxProfit.toFixed(0)}</p>
            <p className="text-xs font-mono font-semibold text-red-400">-${maxLoss.toFixed(0)}</p>
          </div>
        </div>

        {/* Legs */}
        <div className="space-y-1">
          {legs.map((leg, i) => (
            <div key={i} className="flex items-center justify-between text-[11px] rounded-lg px-2.5 py-1.5"
              style={{ background: leg.action === 'SELL' ? 'rgba(239,68,68,0.07)' : 'rgba(16,185,129,0.07)' }}>
              <div className="flex items-center gap-2">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${leg.action === 'SELL' ? 'bg-red-900/50 text-red-300' : 'bg-emerald-900/50 text-emerald-300'}`}>
                  {leg.action}
                </span>
                <span style={{ color: 'var(--text-sub)' }}>
                  ${leg.strike} {leg.type} · {leg.expiry.slice(5)}
                </span>
              </div>
              <span className="font-mono" style={{ color: 'var(--text-muted)' }}>${leg.price.toFixed(3)}</span>
            </div>
          ))}
        </div>

        {/* Breakevens */}
        {breakevens.length > 0 && (
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            Breakeven{breakevens.length > 1 ? 's' : ''}: {breakevens.map(b => `$${b.toFixed(2)}`).join(' / ')}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button onClick={() => setExpanded(e => !e)}
            className="flex-1 py-2 rounded-xl text-[11px] font-medium"
            style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: 'var(--accent)' }}>
            {expanded ? 'Hide payoff' : 'Payoff diagram'}
          </button>
          <button onClick={() => onClose(trade.id)}
            className="flex-1 py-2 rounded-xl text-[11px] font-medium"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
            Close position
          </button>
        </div>
      </div>

      {/* Payoff diagram */}
      {expanded && (
        <div className="px-4 pb-4">
          <ResponsiveContainer width="100%" height={130}>
            <AreaChart data={payoff} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`pg-${trade.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="price" tick={{ fontSize: 8, fill: '#64748b' }} tickLine={false} axisLine={false}
                tickFormatter={v => `$${v}`} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 8, fill: '#64748b' }} tickLine={false} axisLine={false}
                tickFormatter={v => v >= 0 ? `+$${v}` : `-$${Math.abs(v)}`} width={46} />
              <Tooltip contentStyle={{ background: '#0d0d20', border: '1px solid #1e1e3f', borderRadius: 8, fontSize: 10 }}
                formatter={(v: any) => [v >= 0 ? `+$${v}` : `-$${Math.abs(v)}`, 'P&L at expiry']}
                labelFormatter={v => `Spot $${v}`} />
              <ReferenceLine y={0} stroke="#334155" strokeDasharray="3 3" />
              <ReferenceLine x={spot} stroke="#6366f1" strokeWidth={1.5}
                label={{ value: 'Now', position: 'top', fontSize: 8, fill: '#6366f1' }} />
              {breakevens.map((b, i) => (
                <ReferenceLine key={i} x={+b.toFixed(2)} stroke="#f59e0b" strokeDasharray="3 2"
                  label={{ value: 'BE', position: 'insideTopRight', fontSize: 7, fill: '#f59e0b' }} />
              ))}
              <Area type="monotone" dataKey="pnl" stroke="#6366f1" strokeWidth={2}
                fill={`url(#pg-${trade.id})`} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function ClosedCard({ trade }: { trade: Trade }) {
  const pnl      = trade.exit_price != null ? trade.exit_price * trade.quantity : 0
  const isProfit = pnl >= 0
  return (
    <div className="flex items-center justify-between rounded-xl px-3 py-2.5"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold" style={{ color: 'var(--text)' }}>{trade.ticker}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
          style={{ background: 'rgba(99,102,241,0.12)', color: '#a5b4fc' }}>
          {trade.strategy_type}
        </span>
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {trade.quantity} contract{trade.quantity > 1 ? 's' : ''}
        </span>
      </div>
      <div className="flex items-center gap-2">
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

  const totalMaxProfit = open.reduce((s, t) => s + t.max_profit * t.quantity, 0)
  const totalMaxLoss   = open.reduce((s, t) => s + t.max_loss   * t.quantity, 0)
  const realisedPnl    = closed.reduce((s, t) => s + (t.exit_price ?? 0) * t.quantity, 0)

  function handleClose(id: string) {
    closeTrade.mutate({ id, exit_price: 0 })
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

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl p-3 col-span-2 flex justify-between items-center"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div>
            <p className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>Open exposure</p>
            <p className="text-xs font-mono">
              <span className="text-emerald-400 font-semibold">+${totalMaxProfit.toFixed(0)}</span>
              <span style={{ color: 'var(--text-muted)' }}> / </span>
              <span className="text-red-400 font-semibold">-${totalMaxLoss.toFixed(0)}</span>
            </p>
          </div>
          <div className="flex items-center gap-1">
            {realisedPnl >= 0
              ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              : <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
            <div className="text-right">
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Realised</p>
              <p className="text-xs font-mono font-semibold" style={{ color: realisedPnl >= 0 ? '#10b981' : '#ef4444' }}>
                {realisedPnl >= 0 ? '+' : ''}${realisedPnl.toFixed(0)}
              </p>
            </div>
          </div>
        </div>
        {[
          { label: 'Open positions', value: open.length,   color: '#6366f1' },
          { label: 'Closed trades',  value: closed.length, color: '#94a3b8' },
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
            className="flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5"
            style={tab === t ? { background: 'var(--accent)', color: '#fff' } : { color: 'var(--text-muted)' }}>
            {t === 'open' ? <Clock className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
            {t === 'open' ? `Open (${open.length})` : `History (${closed.length})`}
          </button>
        ))}
      </div>

      {tab === 'open' ? (
        open.length === 0 ? (
          <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>No open positions</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Book a trade from the Strategy Screener to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {open.map(t => (
              <OpenCard key={t.id} trade={t} spot={spotPrices[t.ticker] ?? 0} onClose={handleClose} />
            ))}
          </div>
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
