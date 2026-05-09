import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, TrendingUp, TrendingDown, Minus, CheckCircle, AlertTriangle } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { useBookTrade } from '../hooks/useTrades'
import type { StrategyScreenResult } from '../hooks/useStrategyScreener'

interface Props {
  strategy: StrategyScreenResult
  user: User | null
  onClose: () => void
  onSignIn: () => void
}

function thesisIcon(thesis: string) {
  if (thesis === 'Bullish') return <TrendingUp className="w-3.5 h-3.5" />
  if (thesis === 'Bearish') return <TrendingDown className="w-3.5 h-3.5" />
  return <Minus className="w-3.5 h-3.5" />
}

function thesisColor(thesis: string) {
  if (thesis === 'Bullish') return { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.4)', text: '#6ee7b7' }
  if (thesis === 'Bearish') return { bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.4)', text: '#fca5a5' }
  return { bg: 'rgba(99,102,241,0.15)', border: 'rgba(99,102,241,0.4)', text: '#a5b4fc' }
}

function getLeg(leg: any) {
  return {
    action: leg.action as 'BUY' | 'SELL',
    strike: leg.strike ?? leg.contract?.details?.strike_price ?? 0,
    type:   (leg.type ?? leg.contract?.details?.contract_type ?? 'call').toUpperCase(),
    expiry: (leg.expiry ?? leg.contract?.details?.expiration_date ?? ''),
    price:  leg.price,
  }
}

export function TradeModal({ strategy: s, user, onClose, onSignIn }: Props) {
  const [qty, setQty]       = useState(1)
  const [status, setStatus] = useState<'idle' | 'confirm' | 'success' | 'error'>('idle')
  const [errMsg, setErrMsg] = useState('')
  const bookTrade = useBookTrade()
  const tc = thesisColor(s.thesis)

  const netCredit  = s.maxProfit   // per share (positive = credit spread)
  const maxLoss    = s.maxLoss     // per share (positive number)
  const isCredit   = netCredit > 0
  const totalProfit = netCredit * qty * 100
  const totalLoss   = maxLoss  * qty * 100

  async function handleConfirm() {
    if (!user) return
    try {
      const legs = s.legs.map(getLeg)
      await bookTrade.mutateAsync({
        user_id:       user.id,
        ticker:        s.ticker,
        strategy_type: s.type,
        strategy_data: {
          legs,
          dte:        s.dte,
          breakevens: s.breakevens,
          max_profit: +(netCredit * 100).toFixed(2),
          max_loss:   +(maxLoss   * 100).toFixed(2),
        },
        quantity:     qty,
        entry_price:  netCredit,
      })
      setStatus('success')
    } catch (e: any) {
      setErrMsg(e.message ?? 'Failed to book trade')
      setStatus('error')
    }
  }

  return (
    <AnimatePresence>
      <motion.div key="backdrop" className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} />

      <motion.div key="sheet"
        className="fixed bottom-0 left-0 right-0 z-50 max-w-lg mx-auto rounded-t-3xl overflow-hidden"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderBottom: 'none' }}
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}>

        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border)' }} />
        </div>

        <div className="px-5 pb-8 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg font-bold" style={{ color: 'var(--text)' }}>{s.ticker}</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold flex items-center gap-1"
                  style={{ background: tc.bg, border: `1px solid ${tc.border}`, color: tc.text }}>
                  {thesisIcon(s.thesis)} {s.thesis}
                </span>
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>{s.type}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
              <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>

          {status === 'success' ? (
            <div className="py-6 text-center space-y-3">
              <CheckCircle className="w-12 h-12 mx-auto text-emerald-400" />
              <p className="text-base font-semibold" style={{ color: 'var(--text)' }}>Trade booked!</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {qty} contract{qty > 1 ? 's' : ''} of {s.type} on {s.ticker} added to your portfolio.
              </p>
              <button onClick={onClose} className="w-full py-3 rounded-2xl text-sm font-semibold text-white"
                style={{ background: 'var(--accent)' }}>Done</button>
            </div>

          ) : status === 'error' ? (
            <div className="py-6 text-center space-y-3">
              <AlertTriangle className="w-12 h-12 mx-auto text-red-400" />
              <p className="text-base font-semibold text-red-400">Booking failed</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{errMsg}</p>
              <button onClick={() => setStatus('idle')}
                className="w-full py-3 rounded-2xl text-sm font-semibold"
                style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                Try again
              </button>
            </div>

          ) : status === 'confirm' ? (
            <div className="space-y-4">
              <div className="space-y-2">
                {s.legs.map((leg, i) => {
                  const l = getLeg(leg)
                  return (
                    <div key={i} className="flex items-center justify-between rounded-xl px-3 py-2"
                      style={{ background: l.action === 'SELL' ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)' }}>
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${l.action === 'SELL' ? 'bg-red-900/50 text-red-300' : 'bg-emerald-900/50 text-emerald-300'}`}>
                          {l.action}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--text-sub)' }}>
                          ${l.strike} {l.type} · {l.expiry.slice(5)}
                        </span>
                      </div>
                      <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>${l.price.toFixed(3)}</span>
                    </div>
                  )
                })}
              </div>
              <div className="rounded-2xl p-4 space-y-2" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'var(--text-muted)' }}>{isCredit ? 'Credit received' : 'Debit paid'}</span>
                  <span className="font-mono font-semibold" style={{ color: isCredit ? '#10b981' : '#f59e0b' }}>
                    ${Math.abs(totalProfit).toFixed(0)}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'var(--text-muted)' }}>Max profit</span>
                  <span className="font-mono font-semibold text-emerald-400">${totalProfit.toFixed(0)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'var(--text-muted)' }}>Max loss</span>
                  <span className="font-mono font-semibold text-red-400">-${totalLoss.toFixed(0)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'var(--text-muted)' }}>Contracts</span>
                  <span className="font-mono" style={{ color: 'var(--text)' }}>{qty}</span>
                </div>
              </div>
              <div className="rounded-xl p-3 flex items-start gap-2"
                style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  Simulated paper trade only. No real orders are placed. Prices use prev-day close.
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStatus('idle')}
                  className="flex-1 py-3 rounded-2xl text-sm font-semibold"
                  style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  Back
                </button>
                <button onClick={handleConfirm} disabled={bookTrade.isPending}
                  className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white"
                  style={{ background: 'var(--accent)', opacity: bookTrade.isPending ? 0.6 : 1 }}>
                  {bookTrade.isPending ? 'Booking…' : 'Confirm & Book'}
                </button>
              </div>
            </div>

          ) : (
            <>
              {/* Legs */}
              <div className="space-y-2">
                {s.legs.map((leg, i) => {
                  const l = getLeg(leg)
                  return (
                    <div key={i} className="flex items-center justify-between rounded-xl px-3 py-2.5"
                      style={{ background: l.action === 'SELL' ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)', border: `1px solid ${l.action === 'SELL' ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}` }}>
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${l.action === 'SELL' ? 'bg-red-900/50 text-red-300' : 'bg-emerald-900/50 text-emerald-300'}`}>
                          {l.action}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--text-sub)' }}>
                          ${l.strike} {l.type} · {l.expiry.slice(5)} · {s.dte}d
                        </span>
                      </div>
                      <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>${l.price.toFixed(3)}</span>
                    </div>
                  )
                })}
              </div>

              {/* Quantity */}
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Contracts</label>
                <div className="flex items-center gap-3 rounded-xl px-3 py-2"
                  style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
                  <button onClick={() => setQty(q => Math.max(1, q - 1))}
                    className="w-5 h-5 flex items-center justify-center text-lg font-bold"
                    style={{ color: 'var(--accent)' }}>−</button>
                  <span className="w-6 text-center text-sm font-mono font-semibold" style={{ color: 'var(--text)' }}>{qty}</span>
                  <button onClick={() => setQty(q => q + 1)}
                    className="w-5 h-5 flex items-center justify-center text-lg font-bold"
                    style={{ color: 'var(--accent)' }}>+</button>
                </div>
              </div>

              {/* Summary */}
              <div className="rounded-2xl p-4 space-y-2" style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
                {[
                  { label: isCredit ? 'Est. credit' : 'Est. debit', value: `$${Math.abs(totalProfit).toFixed(0)}`, color: isCredit ? '#10b981' : '#f59e0b' },
                  { label: 'Max profit', value: `$${totalProfit.toFixed(0)}`,  color: '#10b981' },
                  { label: 'Max loss',   value: `-$${totalLoss.toFixed(0)}`,   color: '#ef4444' },
                ].map(r => (
                  <div key={r.label} className="flex justify-between text-xs">
                    <span style={{ color: 'var(--text-muted)' }}>{r.label}</span>
                    <span className="font-mono font-semibold" style={{ color: r.color }}>{r.value}</span>
                  </div>
                ))}
              </div>

              {user ? (
                <button onClick={() => setStatus('confirm')}
                  className="w-full py-3.5 rounded-2xl text-sm font-semibold text-white"
                  style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)' }}>
                  Review trade →
                </button>
              ) : (
                <button onClick={onSignIn}
                  className="w-full py-3.5 rounded-2xl text-sm font-semibold"
                  style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', color: '#a5b4fc' }}>
                  Sign in to book trade →
                </button>
              )}
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
