import { useState } from 'react'
import { motion } from 'framer-motion'
import { InfoCard } from './InfoCard'

interface Tooltip {
  title: string
  body: string
  how: string
  signal: string
}

interface Props {
  label: string
  value: string | number
  sub?: string
  icon: React.ReactNode
  color?: 'indigo' | 'emerald' | 'violet' | 'red' | 'amber'
  trend?: 'up' | 'down'
  delay?: number
  tooltip?: Tooltip
}

const colorMap = {
  indigo:  { bg: 'bg-indigo-950/40',  border: 'border-indigo-800/30',  text: 'text-indigo-300',  icon: 'bg-indigo-500/20 text-indigo-400' },
  emerald: { bg: 'bg-emerald-950/40', border: 'border-emerald-800/30', text: 'text-emerald-300', icon: 'bg-emerald-500/20 text-emerald-400' },
  violet:  { bg: 'bg-violet-950/40',  border: 'border-violet-800/30',  text: 'text-violet-300',  icon: 'bg-violet-500/20 text-violet-400' },
  red:     { bg: 'bg-red-950/40',     border: 'border-red-800/30',     text: 'text-red-300',     icon: 'bg-red-500/20 text-red-400' },
  amber:   { bg: 'bg-amber-950/40',   border: 'border-amber-800/30',   text: 'text-amber-300',   icon: 'bg-amber-500/20 text-amber-400' },
}

export function StatCard({ label, value, sub, icon, color = 'indigo', delay = 0, tooltip }: Props) {
  const [open, setOpen] = useState(false)
  const c = colorMap[color]

  return (
    <>
      {open && tooltip && (
        <InfoCard title={tooltip.title} body={tooltip.body} how={tooltip.how} signal={tooltip.signal} onClose={() => setOpen(false)} />
      )}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay }}
        whileTap={{ scale: 0.97 }}
        onClick={() => tooltip && setOpen(true)}
        className={`rounded-2xl p-4 ${tooltip ? 'cursor-pointer' : ''}`}
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-acc)' }}>
        <div className="flex items-start justify-between mb-2">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${c.icon}`}>
            {icon}
          </div>
          {tooltip && <span className="text-[9px] text-slate-600 font-medium">tap</span>}
        </div>
        <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <p className={`text-2xl font-bold font-mono ${c.text}`} style={{ color: c.text.includes('indigo') ? 'var(--accent)' : undefined }}>{value}</p>
        {sub && <p className="text-[10px] mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
      </motion.div>
    </>
  )
}
