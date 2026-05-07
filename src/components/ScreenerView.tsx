import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Search, TrendingUp, TrendingDown, ChevronRight, Loader2 } from 'lucide-react'
import { useScreener, useTickerIV, type ScreenerRow } from '../hooks/useScreener'
import { SECTORS } from '../data/sp500'
import { RollingPicker } from './RollingPicker'

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
      className="w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-colors text-left"
      style={{ background: `linear-gradient(135deg, rgba(99,102,241,0.06) 0%, var(--grad-end) 100%)`, border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(14,165,233,0.1)' }}>
          <span className="text-[11px] font-bold" style={{ color: 'var(--accent)' }}>{row.ticker.slice(0, 4)}</span>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>{row.ticker}</span>
            <IVBadge ivRank={ivRank} />
          </div>
          <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{row.name}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="text-right">
          <p className="text-sm font-mono font-semibold" style={{ color: 'var(--text)' }}>{fmtPrice(row.price)}</p>
          <div className={`flex items-center gap-0.5 justify-end text-[10px] font-mono ${row.changePct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {row.changePct >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
            {row.changePct >= 0 ? '+' : ''}{row.changePct.toFixed(2)}%
          </div>
        </div>
        {iv30 > 0 && (
          <div className="text-right hidden sm:block">
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>IV30</p>
            <p className="text-xs font-mono" style={{ color: 'var(--accent)' }}>{iv30.toFixed(1)}%</p>
          </div>
        )}
        <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
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
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search ticker or company…"
          className="w-full rounded-2xl pl-10 pr-4 py-3 text-sm focus:outline-none"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)' }}
        />
      </div>

      {/* Sector rolling picker */}
      {/* Sector picker with gradient contrast surround */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.22) 0%,rgba(124,58,237,0.15) 50%,var(--grad-end) 100%)', padding: '1.5px' }}>
        <div className="rounded-2xl px-3 py-2" style={{ background: 'var(--bg-card)' }}>
          <div className="flex items-center justify-between mb-1 px-1">
            <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>Filter by Sector</p>
            <p className="text-[10px] font-semibold" style={{ color: 'var(--text-sub)' }}>{sector}</p>
          </div>
          <RollingPicker items={['All', ...SECTORS]} selected={sector} onChange={setSector} width="100%" />
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center justify-between px-1">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{filtered.length} stocks · 15-min delayed</p>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
          className="text-[11px] rounded-lg px-2 py-1 focus:outline-none"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-sub)' }}>
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
