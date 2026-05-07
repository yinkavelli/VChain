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
  indigo:  { rgba: 'rgba(99,102,241,0.18)',  border: 'rgba(99,102,241,0.25)',  text: 'text-indigo-400',  icon: 'bg-indigo-500/20 text-indigo-400'  },
  emerald: { rgba: 'rgba(16,185,129,0.18)',  border: 'rgba(16,185,129,0.25)',  text: 'text-emerald-400', icon: 'bg-emerald-500/20 text-emerald-400' },
  violet:  { rgba: 'rgba(139,92,246,0.18)',  border: 'rgba(139,92,246,0.25)',  text: 'text-violet-400',  icon: 'bg-violet-500/20 text-violet-400'  },
  red:     { rgba: 'rgba(239,68,68,0.18)',   border: 'rgba(239,68,68,0.25)',   text: 'text-red-400',     icon: 'bg-red-500/20 text-red-400'        },
  amber:   { rgba: 'rgba(245,158,11,0.18)',  border: 'rgba(245,158,11,0.25)',  text: 'text-amber-400',   icon: 'bg-amber-500/20 text-amber-400'    },
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
        style={{ background: `linear-gradient(135deg, ${c.rgba} 0%, var(--grad-end) 100%)`, border: `1px solid ${c.border}` }}>
        <div className="flex items-start justify-between mb-2">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${c.icon}`}>
            {icon}
          </div>
          {tooltip && <span className="text-[9px] font-medium" style={{ color: 'var(--text-muted)' }}>tap</span>}
        </div>
        <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <p className="text-2xl font-bold font-mono" style={{ color: 'var(--text)' }}>{value}</p>
        {sub && <p className="text-[10px] mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
      </motion.div>
    </>
  )
}
