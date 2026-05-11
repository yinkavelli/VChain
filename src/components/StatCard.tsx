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
  indigo:  {
    primary: '#818cf8',
    gradStart: 'rgba(49,46,129,0.55)',
    gradEnd:   'rgba(30,27,75,0.25)',
    border:    'rgba(99,102,241,0.5)',
    iconBg:    'rgba(99,102,241,0.2)',
    glow:      '0 4px 24px rgba(99,102,241,0.25)',
  },
  emerald: {
    primary: '#34d399',
    gradStart: 'rgba(6,78,59,0.55)',
    gradEnd:   'rgba(2,44,34,0.25)',
    border:    'rgba(16,185,129,0.5)',
    iconBg:    'rgba(16,185,129,0.2)',
    glow:      '0 4px 24px rgba(16,185,129,0.22)',
  },
  violet:  {
    primary: '#a78bfa',
    gradStart: 'rgba(76,29,149,0.55)',
    gradEnd:   'rgba(46,16,101,0.25)',
    border:    'rgba(139,92,246,0.5)',
    iconBg:    'rgba(139,92,246,0.2)',
    glow:      '0 4px 24px rgba(139,92,246,0.22)',
  },
  red:     {
    primary: '#f87171',
    gradStart: 'rgba(127,29,29,0.55)',
    gradEnd:   'rgba(69,10,10,0.25)',
    border:    'rgba(239,68,68,0.5)',
    iconBg:    'rgba(239,68,68,0.2)',
    glow:      '0 4px 24px rgba(239,68,68,0.22)',
  },
  amber:   {
    primary: '#fbbf24',
    gradStart: 'rgba(120,53,15,0.55)',
    gradEnd:   'rgba(69,26,3,0.25)',
    border:    'rgba(245,158,11,0.5)',
    iconBg:    'rgba(245,158,11,0.2)',
    glow:      '0 4px 24px rgba(245,158,11,0.22)',
  },
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
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay, duration: 0.4 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => tooltip && setOpen(true)}
        className={`stat-${color} relative overflow-hidden rounded-2xl p-4 border ${tooltip ? 'cursor-pointer' : ''}`}
        style={{ boxShadow: c.glow }}>

        {/* Shimmer sweep */}
        <div className="card-shimmer" />

        {/* Card content — above shimmer */}
        <div className="relative z-10">
          <div className="flex items-start justify-between mb-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: c.iconBg }}>
              <span style={{ color: c.primary }}>{icon}</span>
            </div>
            {tooltip && (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md"
                style={{ color: c.primary, background: c.iconBg }}>tap</span>
            )}
          </div>
          <p className="text-[10px] uppercase tracking-widest mb-1.5 font-medium" style={{ color: 'var(--text-muted)' }}>
            {label}
          </p>
          <p className="text-2xl font-bold" style={{ color: 'var(--text)', fontFamily: 'Inter, sans-serif' }}>
            {value}
          </p>
          {sub && (
            <p className="text-[11px] mt-1.5 font-medium leading-snug" style={{ color: 'var(--text-sub)' }}>
              {sub}
            </p>
          )}
        </div>
      </motion.div>
    </>
  )
}
