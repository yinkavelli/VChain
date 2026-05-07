import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { useOptionChain, getExpiries, buildChainRows } from '../hooks/useOptionChain'
import { useTickerIV } from '../hooks/useScreener'
import { RollingPicker } from './RollingPicker'

function fmt(n: number | undefined, dp = 2) {
  if (!n || isNaN(n)) return '—'
  return n.toFixed(dp)
}
function fmtP(n: number | undefined) {
  if (!n || isNaN(n)) return '—'
  return n > 100 ? `$${n.toFixed(2)}` : `$${n.toFixed(3)}`
}
function fmtIV(n: number | undefined) {
  if (!n || isNaN(n)) return '—'
  return `${(n * 100).toFixed(1)}%`
}
function fmtExpiry(e: string) {
  const d = new Date(e + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}
function dte(e: string) {
  return `${Math.round((new Date(e).getTime() - Date.now()) / 86_400_000)}d`
}

interface Props { ticker: string; spotPrice: number }

export function OptionChainView({ ticker, spotPrice }: Props) {
  const [side, setSide]     = useState<'call' | 'put'>('call')
  const [expiry, setExpiry] = useState('')

  const { data: contracts = [], isLoading } = useOptionChain(ticker, !!ticker)
  const { data: iv } = useTickerIV(ticker, spotPrice)

  const expiries     = useMemo(() => getExpiries(contracts), [contracts])
  const activeExpiry = expiry || expiries[0] || ''
  const rows         = useMemo(() => buildChainRows(contracts, activeExpiry, spotPrice, 6), [contracts, activeExpiry, spotPrice])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">{ticker}</h2>
          <p className="text-xs text-slate-500">
            ${spotPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            {iv?.iv30 ? ` · IV30 ${iv.iv30}%` : ''}
            {iv?.ivRank ? ` · IVR ${iv.ivRank}` : ''}
          </p>
        </div>
        {isLoading && <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />}
      </div>

      {/* Calls / Puts toggle */}
      <div className="flex gap-1 p-1 rounded-2xl border border-blue-900/40 bg-[#050514]">
        {(['call', 'put'] as const).map(s => (
          <button key={s} onClick={() => setSide(s)}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${side === s ? 'text-white' : 'text-slate-500'}`}
            style={side === s ? {
              background: s === 'call' ? 'linear-gradient(135deg,#0ea5e9,#06b6d4)' : 'linear-gradient(135deg,#f43f5e,#e11d48)',
              boxShadow: s === 'call' ? '0 0 16px rgba(14,165,233,0.4)' : '0 0 16px rgba(244,63,94,0.4)'
            } : {}}>
            {s === 'call' ? '↑ Calls' : '↓ Puts'}
          </button>
        ))}
      </div>

      {/* Expiry rolling picker */}
      {expiries.length > 0 && (
        <div className="rounded-2xl border border-blue-900/30 p-4"
          style={{ background: 'linear-gradient(160deg,rgba(14,30,80,0.5) 0%,rgba(5,5,20,0.9) 100%)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Expiry Date</p>
            <p className="text-[10px] text-slate-500">{expiries.length} dates · up to 2yr</p>
          </div>
          <div className="flex items-center justify-center gap-6">
            <RollingPicker items={expiries} selected={activeExpiry} onChange={setExpiry} formatLabel={fmtExpiry} width={200} />
            <div className="text-center">
              <p className="text-2xl font-bold text-white font-mono">{dte(activeExpiry)}</p>
              <p className="text-[10px] text-slate-500">to expiry</p>
            </div>
          </div>
        </div>
      )}

      {/* Chain table */}
      {isLoading ? (
        <div className="rounded-2xl border border-blue-900/20 bg-[#05050f] py-12 text-center">
          <Loader2 className="w-6 h-6 text-blue-400 animate-spin mx-auto mb-2" />
          <p className="text-sm text-slate-500">Loading contracts…</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-blue-900/30 overflow-auto max-h-[62svh] bg-[#05080f]">
          <div style={{ minWidth: 520 }}>
            {/* Header */}
            <div className="flex border-b border-blue-900/30 sticky top-0 z-20 bg-[#080c23]">
              <div style={{ width: 80, minWidth: 80 }}
                className="sticky left-0 z-30 px-3 py-2.5 text-center border-r border-blue-900/30 bg-[#0e1e50]/80">
                <div className="text-[10px] font-bold text-blue-400">Strike</div>
              </div>
              {['Bid', 'Ask', 'IV', 'Δ Delta', 'θ Theta', 'Γ', 'ν Vega', 'OI'].map(h => (
                <div key={h} style={{ width: 68, minWidth: 68 }} className="px-2 py-2.5">
                  <div className="text-[10px] font-semibold text-slate-500">{h}</div>
                </div>
              ))}
            </div>

            {/* Rows */}
            {rows.map((row, i) => {
              const c = side === 'call' ? row.call : row.put
              if (!c) return null
              return (
                <motion.div key={row.strike}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                  className="flex border-b border-blue-950/30 items-center"
                  style={{ background: row.isATM ? 'rgba(14,30,80,0.4)' : i % 2 === 0 ? 'transparent' : 'rgba(10,15,35,0.3)' }}>
                  <div style={{ width: 80, minWidth: 80, background: row.isATM ? 'rgba(14,30,80,0.6)' : i % 2 === 0 ? '#05050f' : '#07080e' }}
                    className="sticky left-0 z-10 px-3 py-3 text-center border-r border-blue-900/20">
                    <div className={`text-xs font-bold font-mono ${row.isATM ? 'text-blue-300' : 'text-slate-300'}`}>
                      ${row.strike.toLocaleString()}
                    </div>
                    {row.isATM && <div className="text-[8px] text-blue-400 font-bold mt-0.5">ATM</div>}
                  </div>
                  {[
                    <span className={`font-mono font-semibold ${side === 'call' ? 'text-cyan-400' : 'text-rose-400'}`}>{fmtP(c.last_quote?.bid)}</span>,
                    <span className="text-slate-300 font-mono">{fmtP(c.last_quote?.ask)}</span>,
                    <span className="text-blue-300">{fmtIV(c.implied_volatility)}</span>,
                    <span className={side === 'call' ? 'text-cyan-400' : 'text-rose-400'}>{fmt(c.greeks?.delta, 3)}</span>,
                    <span className="text-red-400">{fmt(c.greeks?.theta, 3)}</span>,
                    <span className="text-slate-400">{fmt(c.greeks?.gamma, 4)}</span>,
                    <span className="text-violet-400">{fmt(c.greeks?.vega, 3)}</span>,
                    <span className="text-slate-400">{c.open_interest ? (c.open_interest > 1000 ? `${(c.open_interest/1000).toFixed(1)}k` : String(c.open_interest)) : '—'}</span>,
                  ].map((cell, ci) => (
                    <div key={ci} style={{ width: 68, minWidth: 68 }} className="px-2 py-3 text-xs">{cell}</div>
                  ))}
                </motion.div>
              )
            })}
            {rows.length === 0 && !isLoading && (
              <div className="py-10 text-center text-slate-500 text-sm">No contracts for this expiry</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
