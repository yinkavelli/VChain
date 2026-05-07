import { LayoutDashboard, Search, Link2, Briefcase, Settings } from 'lucide-react'

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'screener',  label: 'Screener',  icon: Search          },
  { id: 'chains',    label: 'Chains',    icon: Link2           },
  { id: 'portfolio', label: 'Portfolio', icon: Briefcase       },
  { id: 'settings',  label: 'Settings',  icon: Settings        },
]

export function BottomNav({ active, onChange }: { active: string; onChange: (t: string) => void }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#1e1e3f]"
      style={{ background: 'rgba(10,10,20,0.97)', backdropFilter: 'blur(20px)' }}>
      <div className="flex max-w-lg mx-auto">
        {TABS.map(t => {
          const Icon = t.icon
          const active_ = active === t.id
          return (
            <button key={t.id} onClick={() => onChange(t.id)}
              className="flex-1 flex flex-col items-center gap-1 py-3 transition-colors">
              <Icon className={`w-5 h-5 ${active_ ? 'text-indigo-400' : 'text-slate-600'}`} />
              <span className={`text-[10px] font-medium ${active_ ? 'text-indigo-400' : 'text-slate-600'}`}>
                {t.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
