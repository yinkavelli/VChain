import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { useOptionChain, getExpiries, buildChainRows } from '../hooks/useOptionChain'
import { useTickerIV } from '../hooks/useScreener'

function fmt(n: number | undefined, dp = 2) {
  if (!n || isNaN(n)) return '—'
  return n.toFixed(dp)
}
function fmtPrice(n: number | undefined) {
  if (!n || isNaN(n)) return '—'
  if (n > 100) return `$${n.toFixed(2)}`
  return `$${n.toFixed(3)}`
}
function fmtIV(n: number | undefined) {
  if (!n || isNaN(n)) return '—'
  return `${(n * 100).toFixed(1)}%`
}

interface Props {
  ticker: string
  spotPrice: number
}

export function OptionChainView({ ticker, spotPrice }: Props) {
  const [side, setSide]     = useState<'call' | 'put'>('call')
  const [expiry, setExpiry] = useState('')

  const { data: contracts = [], isLoading } = useOptionChain(ticker, undefined, undefined, !!ticker)
  const { data: iv } = useTickerIV(ticker, spotPrice)

  const expiries     = useMemo(() => getExpiries(contracts), [contracts])
  const activeExpiry = expiry || expiries[0] || ''
  const rows         = useMemo(() => buildChainRows(contracts, activeExpiry, spotPrice), [contracts, activeExpiry, spotPrice])

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">{ticker}</h2>
          <p className="text-xs text-slate-500">
            ${spotPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })} · IV30 {iv?.iv30 ?? '—'}% · IVR {iv?.ivRank ?? '—'}
          </p>
        </div>
        {isLoading && <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />}
      </div>

      {/* Expiry pills */}
      {expiries.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {expiries.slice(0, 8).map(e => (
            <button key={e} onClick={() => setExpiry(e)}
              className={`flex-shrink-0 text-[11px] px-3 py-1.5 rounded-full font-medium transition-all ${
                activeExpiry === e ? 'tab-active text-white' : 'bg-[#1a1a3a] text-slate-400 border border-[#1e1e3f]'
              }`}>
              {e.slice(5)}
            </button>
          ))}
        </div>
      )}

      {/* Calls/Puts toggle */}
      <div className="flex gap-1 bg-[#0d0d20] rounded-xl p-1 border border-[#1e1e3f]">
        {(['call', 'put'] as const).map(s => (
          <button key={s} onClick={() => setSide(s)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all capitalize ${
              side === s
                ? s === 'call' ? 'bg-emerald-600/80 text-white' : 'bg-red-700/70 text-white'
                : 'text-slate-500'
            }`}>
            {s === 'call' ? '↑ Calls' : '↓ Puts'}
          </button>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="rounded-2xl border border-[#1e1e3f] bg-[#0d0d20] py-12 text-center">
          <Loader2 className="w-6 h-6 text-indigo-400 animate-spin mx-auto mb-2" />
          <p className="text-sm text-slate-500">Loading contracts…</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-[#1e1e3f] overflow-auto max-h-[62svh]">
          <div style={{ minWidth: 560 }}>
            {/* Header */}
            <div className="flex bg-[#0a0a18] border-b border-[#1e1e3f] sticky top-0 z-20">
              <div style={{ width: 80, minWidth: 80 }} className="sticky left-0 z-30 px-3 py-2 text-center bg-indigo-950/60 border-r border-indigo-900/30">
                <div className="text-[10px] font-bold text-indigo-400">Strike</div>
              </div>
              {['Bid', 'Ask', 'IV', 'Δ Delta', 'θ Theta', 'Γ Gamma', 'ν Vega', 'OI', 'Vol'].map(h => (
                <div key={h} style={{ width: 72, minWidth: 72 }} className="px-2 py-2">
                  <div className="text-[10px] font-semibold text-slate-400">{h}</div>
                </div>
              ))}
            </div>

            {/* Rows */}
            {rows.map((row, i) => {
              const c = side === 'call' ? row.call : row.put
              if (!c) return null
              return (
                <motion.div key={row.strike}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.01 }}
                  className={`flex border-b border-[#12122a] items-center ${
                    row.isATM ? 'bg-indigo-950/25' : i % 2 === 0 ? 'bg-transparent' : 'bg-[#0d0d1e]/30'
                  }`}>
                  <div style={{ width: 80, minWidth: 80 }}
                    className={`sticky left-0 z-10 px-3 py-2.5 text-center border-r border-indigo-900/20 ${
                      row.isATM ? 'bg-indigo-950/60' : i % 2 === 0 ? 'bg-[#0a0a14]' : 'bg-[#0c0c1a]'
                    }`}>
                    <div className={`text-xs font-bold font-mono ${row.isATM ? 'text-indigo-300' : 'text-slate-200'}`}>
                      ${row.strike.toLocaleString()}
                    </div>
                    {row.isATM && <div className="text-[9px] bg-indigo-600/40 text-indigo-300 rounded px-1 mt-0.5 inline-block">ATM</div>}
                  </div>
                  {[
                    <span className={`font-mono font-semibold ${side === 'call' ? 'text-emerald-400' : 'text-red-400'}`}>{fmtPrice(c.last_quote?.bid)}</span>,
                    <span className="text-slate-300 font-mono">{fmtPrice(c.last_quote?.ask)}</span>,
                    <span className="text-indigo-300">{fmtIV(c.implied_volatility)}</span>,
                    <span className={side === 'call' ? 'text-emerald-400' : 'text-red-400'}>{fmt(c.greeks?.delta, 3)}</span>,
                    <span className="text-red-400">{fmt(c.greeks?.theta, 3)}</span>,
                    <span className="text-slate-400">{fmt(c.greeks?.gamma, 4)}</span>,
                    <span className="text-violet-400">{fmt(c.greeks?.vega, 3)}</span>,
                    <span className="text-slate-400">{c.open_interest ? (c.open_interest > 1000 ? `${(c.open_interest/1000).toFixed(1)}k` : String(c.open_interest)) : '—'}</span>,
                    <span className="text-slate-400">{c.day?.v ? (c.day.v > 1000 ? `${(c.day.v/1000).toFixed(1)}k` : String(c.day.v)) : '—'}</span>,
                  ].map((cell, ci) => (
                    <div key={ci} style={{ width: 72, minWidth: 72 }} className="px-2 py-2.5 text-xs">
                      {cell}
                    </div>
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
