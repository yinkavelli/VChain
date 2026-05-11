import { useState } from 'react'
import { TrendingUp, TrendingDown, Clock, CheckCircle, LogIn, Trash2, Zap } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import type { User } from '@supabase/supabase-js'
import { useTrades, useCloseTrade, useDeleteTrade, useClearTrades } from '../hooks/useTrades'
import { useLivePnL, type TradePnL } from '../hooks/useLivePnL'
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

function OpenCard({ trade, spot, pnl, closing, onClose, onDelete }: { trade: Trade; spot: number; pnl?: TradePnL; closing?: boolean; onClose: (trade: Trade) => void; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const maxProfit = (trade.strategy_data?.max_profit ?? 0) * trade.quantity
  const maxLoss   = (trade.strategy_data?.max_loss   ?? 0) * trade.quantity
  const payoff    = expanded ? buildPayoff(trade, spot) : []
  const legs      = trade.strategy_data?.legs ?? []
  const breakevens = trade.strategy_data?.breakevens ?? []

  return (
    <div className="p-card overflow-hidden">
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
          <div className="text-right space-y-1">
            {pnl?.totalPnL != null ? (
              <div className="flex items-center justify-end gap-1 rounded-lg px-2 py-1"
                style={{
                  background: pnl.totalPnL >= 0 ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                  border: `1px solid ${pnl.totalPnL >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                }}>
                <Zap className="w-3 h-3" style={{ color: pnl.totalPnL >= 0 ? '#10b981' : '#ef4444' }} />
                <span className="text-xs font-mono font-bold" style={{ color: pnl.totalPnL >= 0 ? '#10b981' : '#ef4444' }}>
                  {pnl.totalPnL >= 0 ? '+' : ''}${pnl.totalPnL.toFixed(0)}
                </span>
                {pnl.isStale && (
                  <span className="text-[8px] ml-0.5" style={{ color: 'var(--text-muted)' }}>close</span>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-end gap-1 rounded-lg px-2 py-1"
                style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
                <Zap className="w-3 h-3 opacity-40" style={{ color: '#a5b4fc' }} />
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Live P&L</span>
              </div>
            )}
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              Max: <span className="text-emerald-400">+${maxProfit.toFixed(0)}</span> / <span className="text-red-400">-${maxLoss.toFixed(0)}</span>
            </p>
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
          <button onClick={() => onClose(trade)} disabled={closing}
            className="flex-1 py-2 rounded-xl text-[11px] font-medium"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', opacity: closing ? 0.6 : 1 }}>
            {closing ? 'Fetching prices…' : 'Close position'}
          </button>
          <button onClick={() => onDelete(trade.id)}
            className="w-8 flex items-center justify-center rounded-xl"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}
            title="Delete trade">
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
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

function ClosedCard({ trade, onDelete }: { trade: Trade; onDelete: (id: string) => void }) {
  const totalPnL   = trade.exit_price != null ? trade.exit_price * trade.quantity : null
  const maxProfit  = (trade.strategy_data?.max_profit ?? 0) * trade.quantity
  const isProfit   = totalPnL !== null && totalPnL >= 0
  const capturePct = totalPnL !== null && maxProfit > 0
    ? Math.round((totalPnL / maxProfit) * 100)
    : null

  return (
    <div className="p-card px-3 py-2.5"
      style={{ borderColor: totalPnL === null ? undefined : isProfit ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold" style={{ color: 'var(--text)' }}>{trade.ticker}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
            style={{ background: 'rgba(99,102,241,0.12)', color: '#a5b4fc' }}>
            {trade.strategy_type}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {trade.quantity}× · {trade.exit_time
              ? new Date(trade.exit_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {totalPnL !== null ? (
            <div className="text-right">
              <p className="text-xs font-mono font-bold" style={{ color: isProfit ? '#10b981' : '#ef4444' }}>
                {isProfit ? '+' : ''}${totalPnL.toFixed(0)}
              </p>
              {capturePct !== null && (
                <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                  {capturePct}% of max
                </p>
              )}
            </div>
          ) : (
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>—</span>
          )}
          <button onClick={() => onDelete(trade.id)} title="Delete">
            <Trash2 className="w-3.5 h-3.5 text-red-400 opacity-50 hover:opacity-100" />
          </button>
        </div>
      </div>
    </div>
  )
}

export function PortfolioView({ user, spotPrices, onSignIn }: Props) {
  const [tab, setTab] = useState<'open' | 'history'>('open')
  const [confirmClear, setConfirmClear] = useState(false)
  const { data: trades = [], isLoading } = useTrades(user?.id)
  const closeTrade  = useCloseTrade()
  const deleteTrade = useDeleteTrade()
  const clearTrades = useClearTrades()

  const open   = trades.filter(t => t.status === 'OPEN')
  const closed = trades.filter(t => t.status === 'CLOSED')

  const { data: livePnL, isFetching: pnlFetching } = useLivePnL(trades)

  const totalMaxProfit = open.reduce((s, t) => s + (t.strategy_data?.max_profit ?? 0) * t.quantity, 0)
  const totalMaxLoss   = open.reduce((s, t) => s + (t.strategy_data?.max_loss   ?? 0) * t.quantity, 0)
  const realisedPnl = closed.reduce((s, t) => s + (t.exit_price != null ? t.exit_price * t.quantity : 0), 0)

  const totalLivePnL = livePnL
    ? open.reduce((s, t) => {
        const p = livePnL[t.id]?.totalPnL
        return p != null ? s + p : s
      }, 0)
    : null
  const hasAnyLivePnL = livePnL && open.some(t => livePnL[t.id]?.totalPnL != null)

  function handleClose(trade: Trade) {
    closeTrade.mutate(trade)
  }

  function handleDelete(id: string) {
    deleteTrade.mutate(id)
  }

  function handleClearAll() {
    if (!user) return
    clearTrades.mutate(user.id, { onSuccess: () => setConfirmClear(false) })
  }

  if (!user) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Portfolio</h2>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Simulated trade tracking</p>
        </div>
        <div className="p-card p-8 text-center space-y-4">
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
        <div className="flex items-center gap-2">
          {isLoading && <div className="w-4 h-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />}
          {trades.length > 0 && (
            confirmClear ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Sure?</span>
                <button onClick={handleClearAll}
                  className="text-[10px] px-2 py-1 rounded-lg font-semibold text-white"
                  style={{ background: '#ef4444' }}>
                  {clearTrades.isPending ? '…' : 'Yes, clear'}
                </button>
                <button onClick={() => setConfirmClear(false)}
                  className="text-[10px] px-2 py-1 rounded-lg"
                  style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmClear(true)}
                className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg"
                style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <Trash2 className="w-3 h-3" /> Clear all
              </button>
            )
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-card p-3 col-span-2">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>Open exposure (max)</p>
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
          {open.length > 0 && (
            <div className="flex items-center gap-2 rounded-xl px-3 py-2"
              style={{ background: hasAnyLivePnL && totalLivePnL != null
                ? (totalLivePnL >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)')
                : 'rgba(99,102,241,0.08)',
                border: hasAnyLivePnL && totalLivePnL != null
                  ? (totalLivePnL >= 0 ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(239,68,68,0.3)')
                  : '1px solid rgba(99,102,241,0.2)'
              }}>
              <Zap className={`w-3.5 h-3.5 flex-shrink-0 ${pnlFetching ? 'animate-pulse' : ''}`}
                style={{ color: hasAnyLivePnL && totalLivePnL != null
                  ? (totalLivePnL >= 0 ? '#10b981' : '#ef4444')
                  : '#a5b4fc' }} />
              <div className="flex-1 flex items-center justify-between">
                <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
                  Live P&L {pnlFetching ? '(updating…)' : ''}
                </span>
                {hasAnyLivePnL && totalLivePnL != null ? (
                  <span className="text-sm font-mono font-bold"
                    style={{ color: totalLivePnL >= 0 ? '#10b981' : '#ef4444' }}>
                    {totalLivePnL >= 0 ? '+' : ''}${totalLivePnL.toFixed(0)}
                  </span>
                ) : (
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {pnlFetching ? 'Fetching…' : 'No live prices available'}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
        {[
          { label: 'Open positions', value: open.length,   color: '#6366f1' },
          { label: 'Closed trades',  value: closed.length, color: '#94a3b8' },
        ].map(c => (
          <div key={c.label} className="p-card p-3">
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
          <div className="p-card p-8 text-center">
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>No open positions</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Book a trade from the Strategy Screener to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {open.map(t => (
              <OpenCard key={t.id} trade={t} spot={spotPrices[t.ticker] ?? 0}
                pnl={livePnL?.[t.id]} closing={closeTrade.isPending}
                onClose={handleClose} onDelete={handleDelete} />
            ))}
          </div>
        )
      ) : (
        closed.length === 0 ? (
          <div className="p-card p-8 text-center">
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>No trade history</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Closed trades will appear here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {closed.map(t => <ClosedCard key={t.id} trade={t} onDelete={handleDelete} />)}
          </div>
        )
      )}
    </div>
  )
}
