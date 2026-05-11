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
  indigo:  { primary: '#6366f1', soft: 'rgba(99,102,241,0.12)',  border: 'rgba(99,102,241,0.3)',  glow: 'rgba(99,102,241,0.2)',  icon: 'rgba(99,102,241,0.15)'  },
  emerald: { primary: '#10b981', soft: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.3)',  glow: 'rgba(16,185,129,0.2)',  icon: 'rgba(16,185,129,0.15)'  },
  violet:  { primary: '#8b5cf6', soft: 'rgba(139,92,246,0.12)',  border: 'rgba(139,92,246,0.3)',  glow: 'rgba(139,92,246,0.2)',  icon: 'rgba(139,92,246,0.15)'  },
  red:     { primary: '#ef4444', soft: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)',   glow: 'rgba(239,68,68,0.2)',   icon: 'rgba(239,68,68,0.15)'   },
  amber:   { primary: '#f59e0b', soft: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)',  glow: 'rgba(245,158,11,0.2)',  icon: 'rgba(245,158,11,0.15)'  },
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
        className={`glass-card p-4 ${tooltip ? 'cursor-pointer' : ''}`}
        style={{
          border: `1px solid ${c.border}`,
          boxShadow: `0 0 24px ${c.glow}, 0 8px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)`,
          background: `linear-gradient(145deg, ${c.soft} 0%, rgba(8,8,20,0.96) 100%)`,
        }}>
        <div className="flex items-start justify-between mb-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: c.icon, border: `1px solid ${c.border}` }}>
            <span style={{ color: c.primary }}>{icon}</span>
          </div>
          {tooltip && <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-md"
            style={{ color: c.primary, background: c.icon }}>tap</span>}
        </div>
        <p className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <p className="text-2xl font-bold font-mono" style={{ color: 'var(--text)' }}>{value}</p>
        {sub && <p className="text-[10px] mt-1.5 leading-relaxed" style={{ color: 'var(--text-sub)' }}>{sub}</p>}
      </motion.div>
    </>
  )
}
