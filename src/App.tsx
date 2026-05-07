import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, Link2, Zap } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { BottomNav } from './components/BottomNav'
import { ScreenerView } from './components/ScreenerView'
import { OptionChainView } from './components/OptionChainView'
import { useScreener } from './hooks/useScreener'

export default function App() {
  const [activeTab, setActiveTab]   = useState('screener')
  const [selectedTicker, setTicker] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const qc = useQueryClient()

  const { data: rows = [] } = useScreener()
  const spotPrice = rows.find(r => r.ticker === selectedTicker)?.price ?? 0

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
    <div className="min-h-svh bg-[#0a0a14] text-slate-200">
      <header className="sticky top-0 z-20 border-b border-[#1e1e3f]"
        style={{ background: 'rgba(10,10,20,0.95)', backdropFilter: 'blur(20px)' }}>
        <div className="flex items-center justify-between px-4 py-3 max-w-lg mx-auto">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center"
              style={{ boxShadow: '0 0 16px rgba(99,102,241,0.4)' }}>
              <Link2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white leading-tight">V Chain</h1>
              <p className="text-[9px] text-indigo-400 font-medium leading-tight">Stock Options Intelligence</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-[10px] text-right">
              <div className="flex items-center gap-1 justify-end mb-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-amber-400 font-medium">15-min delay</span>
              </div>
              <div className="text-slate-500">S&P 500</div>
            </div>
            <button onClick={handleRefresh}
              className="w-8 h-8 rounded-xl bg-[#1a1a3a] border border-[#1e1e3f] flex items-center justify-center text-slate-400 hover:text-indigo-400 transition-colors">
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-indigo-400' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      <main className="px-4 pt-4 pb-24 max-w-lg mx-auto">
        <AnimatePresence mode="wait">
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
                <div className="rounded-2xl border border-[#1e1e3f] bg-[#0d0d20] p-8 text-center">
                  <Link2 className="w-8 h-8 text-indigo-400 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-white mb-1">No ticker selected</p>
                  <p className="text-xs text-slate-500">Pick a stock from the Screener to view its option chain</p>
                </div>
              ) : (
                <OptionChainView ticker={selectedTicker} spotPrice={spotPrice} />
              )}
            </motion.div>
          )}
          {activeTab === 'portfolio' && (
            <motion.div key="portfolio"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <div className="rounded-2xl border border-[#1e1e3f] bg-[#0d0d20] p-8 text-center">
                <Zap className="w-8 h-8 text-indigo-400 mx-auto mb-3" />
                <p className="text-sm font-semibold text-white mb-1">Portfolio coming soon</p>
                <p className="text-xs text-slate-500">Simulated trade booking and P&L tracking</p>
              </div>
            </motion.div>
          )}
          {activeTab === 'settings' && (
            <motion.div key="settings"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="space-y-5">
              <div>
                <h2 className="text-lg font-bold text-white mb-0.5">Settings</h2>
                <p className="text-xs text-slate-500">Data source & preferences</p>
              </div>
              <div className="gradient-card rounded-2xl p-4 space-y-3">
                <p className="text-sm font-semibold text-white">Data Source</p>
                <div className="space-y-2 text-xs text-slate-400">
                  <div className="flex justify-between"><span>Provider</span><span className="text-white">Massive.com</span></div>
                  <div className="flex justify-between"><span>Delay</span><span className="text-amber-400">15 minutes (Starter)</span></div>
                  <div className="flex justify-between"><span>Universe</span><span className="text-white">S&P 500</span></div>
                  <div className="flex justify-between"><span>Greeks</span><span className="text-emerald-400">Included</span></div>
                  <div className="flex justify-between"><span>Historical IV</span><span className="text-emerald-400">Up to 5 years</span></div>
                </div>
              </div>
              <div className="gradient-card rounded-2xl p-4">
                <div className="text-sm font-medium text-white mb-1">Version</div>
                <div className="text-xs text-indigo-400 font-mono">V Chain v1.0.0 · Massive.com Options API</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <BottomNav active={activeTab} onChange={setActiveTab} />
    </div>
  )
}
