import { LayoutDashboard, Search, Link2, Briefcase, BrainCircuit, Zap } from 'lucide-react'

const TABS = [
  { id: 'dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
  { id: 'screener',   label: 'Stocks',     icon: Search          },
  { id: 'strategies', label: 'Screener',   icon: Zap             },
  { id: 'chains',     label: 'Chains',     icon: Link2           },
  { id: 'portfolio',  label: 'Portfolio',  icon: Briefcase       },
  { id: 'advisor',    label: 'Advisor',    icon: BrainCircuit    },
]

export function BottomNav({ active, onChange }: { active: string; onChange: (t: string) => void }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50"
      style={{ background: 'var(--bg-nav)', backdropFilter: 'blur(20px)', borderTop: '1px solid var(--border)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex max-w-lg mx-auto">
        {TABS.map(t => {
          const Icon = t.icon
          const active_ = active === t.id
          const isAdvisor = t.id === 'advisor'
          return (
            <button key={t.id} onClick={() => onChange(t.id)}
              className="flex-1 flex flex-col items-center gap-1 py-3 transition-colors">
              <Icon className="w-5 h-5" style={{
                color: active_ ? (isAdvisor ? '#7c3aed' : 'var(--accent)') : 'var(--text-muted)',
                filter: active_ && isAdvisor ? 'drop-shadow(0 0 6px rgba(124,58,237,0.6))' : 'none',
              }} />
              <span className="text-[10px] font-medium" style={{
                color: active_ ? (isAdvisor ? '#7c3aed' : 'var(--accent)') : 'var(--text-muted)',
              }}>
                {t.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
