import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Search, TrendingUp, TrendingDown, ChevronRight, Loader2 } from 'lucide-react'
import { useScreener, useTickerIV, type ScreenerRow } from '../hooks/useScreener'
import { SECTORS } from '../data/sp500'

function fmtPrice(n: number) {
  if (!n) return '—'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function IVBadge({ ivRank }: { ivRank: number }) {
  if (!ivRank) return <span className="text-[10px] text-slate-600">—</span>
  const color = ivRank > 70 ? 'text-emerald-400 bg-emerald-900/40' : ivRank > 40 ? 'text-amber-400 bg-amber-900/40' : 'text-slate-400 bg-slate-800/60'
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${color}`}>{ivRank}</span>
}

function RowWithIV({ row, onClick }: { row: ScreenerRow; onClick: () => void }) {
  const { data: iv } = useTickerIV(row.ticker, row.price)
  const ivRank = iv?.ivRank ?? 0
  const iv30   = iv?.iv30 ?? 0

  return (
    <motion.button
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-[#1e1e3f] bg-[#0d0d20] hover:border-indigo-800/50 transition-colors text-left">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
          <span className="text-[11px] font-bold text-indigo-300">{row.ticker.slice(0, 4)}</span>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white">{row.ticker}</span>
            <IVBadge ivRank={ivRank} />
          </div>
          <p className="text-[10px] text-slate-500 truncate">{row.name}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="text-right">
          <p className="text-sm font-mono font-semibold text-white">{fmtPrice(row.price)}</p>
          <div className={`flex items-center gap-0.5 justify-end text-[10px] font-mono ${row.changePct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {row.changePct >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
            {row.changePct >= 0 ? '+' : ''}{row.changePct.toFixed(2)}%
          </div>
        </div>
        {iv30 > 0 && (
          <div className="text-right hidden sm:block">
            <p className="text-[10px] text-slate-500">IV30</p>
            <p className="text-xs font-mono text-indigo-300">{iv30.toFixed(1)}%</p>
          </div>
        )}
        <ChevronRight className="w-4 h-4 text-slate-600" />
      </div>
    </motion.button>
  )
}

interface Props {
  onSelectTicker: (ticker: string) => void
}

export function ScreenerView({ onSelectTicker }: Props) {
  const [sector, setSector]   = useState('All')
  const [search, setSearch]   = useState('')
  const [sortBy, setSortBy]   = useState<'ivRank' | 'changePct' | 'volume'>('changePct')
  const { data: rows = [], isLoading } = useScreener(sector)

  const filtered = useMemo(() => {
    let r = rows
    if (search) r = r.filter(s =>
      s.ticker.toLowerCase().includes(search.toLowerCase()) ||
      s.name.toLowerCase().includes(search.toLowerCase())
    )
    return r.slice(0, 60) // cap display
  }, [rows, search])

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search ticker or company…"
          className="w-full bg-[#0d0d20] border border-[#1e1e3f] rounded-2xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      {/* Sector filter */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        {['All', ...SECTORS].map(s => (
          <button key={s} onClick={() => setSector(s)}
            className={`flex-shrink-0 text-[11px] px-3 py-1.5 rounded-full font-medium transition-all ${
              sector === s ? 'tab-active text-white' : 'bg-[#1a1a3a] text-slate-400 border border-[#1e1e3f]'
            }`}>
            {s}
          </button>
        ))}
      </div>

      {/* Stats bar */}
      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-slate-500">{filtered.length} stocks · 15-min delayed</p>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
          className="text-[11px] bg-[#0d0d20] border border-[#1e1e3f] rounded-lg px-2 py-1 text-slate-400 focus:outline-none">
          <option value="changePct">Sort: % Change</option>
          <option value="volume">Sort: Volume</option>
        </select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => (
            <RowWithIV key={row.ticker} row={row} onClick={() => onSelectTicker(row.ticker)} />
          ))}
        </div>
      )}
    </div>
  )
}
