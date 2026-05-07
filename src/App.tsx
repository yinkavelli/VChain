import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, Link2, Sun, Moon } from 'lucide-react'
import { useTheme } from './hooks/useTheme'
import { useQueryClient } from '@tanstack/react-query'
import { BottomNav } from './components/BottomNav'
import { Ticker } from './components/Ticker'
import { DashboardView } from './components/DashboardView'
import { ScreenerView } from './components/ScreenerView'
import { OptionChainView } from './components/OptionChainView'
import { useScreener } from './hooks/useScreener'

export default function App() {
  const [activeTab, setActiveTab]   = useState('dashboard')
  const [selectedTicker, setTicker] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const { dark, toggle } = useTheme()
  const qc = useQueryClient()

  const { data: stocks = [], isLoading } = useScreener()
  const spotPrice = stocks.find(r => r.ticker === selectedTicker)?.price ?? 0

  function handleRefresh() {
    setRefreshing(true)
    qc.invalidateQueries()
    setTimeout(() => setRefreshing(false), 1500)
  }

  function handleSelectTicker(ticker: string) {
    setTicker(ticker)
    setActiveTab('chains')
  }

  return (
    <div className="min-h-svh" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <header className="sticky top-0 z-20" style={{ background: 'var(--bg-header)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-4 py-3 max-w-lg mx-auto">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)', boxShadow: '0 0 16px rgba(99,102,241,0.4)' }}>
              <Link2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold leading-tight" style={{ color: 'var(--text)' }}>V Chain</h1>
              <p className="text-[9px] font-medium leading-tight" style={{ color: 'var(--accent)' }}>Stock Options Intelligence</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-[10px] text-right">
              <div className="flex items-center gap-1 justify-end mb-0.5">
                {isLoading && !stocks.length ? (
                  <><span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" /><span className="text-blue-400 font-medium">Loading…</span></>
                ) : (
                  <><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /><span className="text-amber-500 font-medium">15-min delay</span></>
                )}
              </div>
              <div style={{ color: 'var(--text-muted)' }}>{stocks.length} stocks</div>
            </div>
            <button onClick={toggle} title={dark ? 'Switch to light' : 'Switch to dark'}
              className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
              style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)', color: 'var(--text-sub)' }}>
              {dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
            <button onClick={handleRefresh}
              className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
              style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)', color: 'var(--text-sub)' }}>
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing || isLoading ? 'animate-spin' : ''}`}
                style={{ color: refreshing || isLoading ? 'var(--accent)' : 'var(--text-sub)' }} />
            </button>
          </div>
        </div>
        <Ticker stocks={stocks.slice(0, 30)} dark={dark} />
      </header>

      <main className="px-4 pt-4 pb-24 max-w-lg mx-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div key="dashboard"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <DashboardView stocks={stocks} onSelectTicker={handleSelectTicker} />
            </motion.div>
          )}
          {activeTab === 'screener' && (
            <motion.div key="screener"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <ScreenerView onSelectTicker={handleSelectTicker} />
            </motion.div>
          )}
          {activeTab === 'chains' && (
            <motion.div key="chains"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="space-y-3">
              {!selectedTicker ? (
                <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <Link2 className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--accent)' }} />
                  <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>No ticker selected</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Pick a stock from the Screener to view its option chain</p>
                </div>
              ) : (
                <OptionChainView ticker={selectedTicker} spotPrice={spotPrice} />
              )}
            </motion.div>
          )}
          {activeTab === 'portfolio' && (
            <motion.div key="portfolio"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <Link2 className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--accent)' }} />
                <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Portfolio coming soon</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Simulated trade booking and P&L tracking</p>
              </div>
            </motion.div>
          )}
          {activeTab === 'settings' && (
            <motion.div key="settings"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="space-y-5">
              <div>
                <h2 className="text-lg font-bold mb-0.5" style={{ color: 'var(--text)' }}>Settings</h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Data source & preferences</p>
              </div>
              <div className="gradient-card p-4 space-y-3">
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Data Source</p>
                <div className="space-y-2 text-xs">
                  {[['Provider','Massive.com'],['Universe',`S&P 500 (${stocks.length} loaded)`]].map(([k,v]) => (
                    <div key={k} className="flex justify-between">
                      <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                      <span style={{ color: 'var(--text)' }}>{v}</span>
                    </div>
                  ))}
                  <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>Delay</span><span className="text-amber-500">15 minutes</span></div>
                  <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>Greeks & IV</span><span className="text-emerald-500">Live ✓</span></div>
                  <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>Option Bid/Ask</span><span className="text-amber-500">EOD only ⚠</span></div>
                  <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>Historical IV</span><span className="text-emerald-500">Up to 5 years</span></div>
                </div>
              </div>
              {/* Upgrade nudge */}
              <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg,rgba(245,158,11,0.12) 0%,rgba(13,13,32,0.95) 100%)', border: '1px solid rgba(245,158,11,0.25)' }}>
                <p className="text-sm font-semibold text-amber-400 mb-1">Unlock live Bid/Ask</p>
                <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                  Upgrade to Massive Developer ($79/mo) to get real-time intraday option quotes. Currently on Starter — option prices show previous day's close only.
                </p>
                <p className="text-[10px] text-amber-500 font-mono">massive.com/pricing</p>
              </div>

              <div className="gradient-card p-4">
                <p className="text-sm font-medium mb-2" style={{ color: 'var(--text)' }}>Appearance</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--text-sub)' }}>{dark ? 'Dark mode active' : 'Light mode active'}</span>
                  <button onClick={toggle} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
                    style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)', color: 'var(--text-sub)' }}>
                    {dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                    Switch to {dark ? 'light' : 'dark'}
                  </button>
                </div>
              </div>
              <div className="gradient-card p-4">
                <div className="text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>Version</div>
                <div className="text-xs font-mono" style={{ color: 'var(--accent)' }}>V Chain v1.0.0 · Massive.com Options API</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <BottomNav active={activeTab} onChange={setActiveTab} />
    </div>
  )
}
