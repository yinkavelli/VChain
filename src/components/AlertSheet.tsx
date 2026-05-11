import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Bell, BellOff, Trash2, RefreshCw, Plus, Loader2 } from 'lucide-react'
import { useAlerts, useCreateAlert, useDeleteAlert, useResetAlert, registerPushSubscription, CONDITION_LABELS } from '../hooks/useAlerts'
import type { AlertCondition } from '../hooks/useAlerts'

const CONDITIONS: AlertCondition[] = ['price_above', 'price_below', 'change_pct_above', 'change_pct_below', 'iv_rank_above']

interface Props {
  ticker: string
  spot: number
  userId: string
  onClose: () => void
}

export function AlertSheet({ ticker, spot, userId, onClose }: Props) {
  const { data: allAlerts = [] } = useAlerts(userId)
  const createAlert = useCreateAlert(userId)
  const deleteAlert = useDeleteAlert(userId)
  const resetAlert  = useResetAlert(userId)

  const tickerAlerts = allAlerts.filter(a => a.ticker === ticker)

  const [condition, setCondition] = useState<AlertCondition>('price_above')
  const [threshold, setThreshold] = useState(spot > 0 ? spot.toFixed(2) : '')
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)

  async function handleEnablePush() {
    setPushLoading(true)
    const ok = await registerPushSubscription(userId)
    setPushEnabled(ok)
    setPushLoading(false)
  }

  async function handleCreate() {
    const t = parseFloat(threshold)
    if (isNaN(t)) return
    await createAlert.mutateAsync({ ticker, condition, threshold: t })
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex flex-col justify-end"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

        {/* Sheet */}
        <motion.div
          className="p-card relative rounded-t-3xl overflow-hidden"
          style={{ maxHeight: '85vh' }}
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}>

          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border)' }} />
          </div>

          <div className="overflow-y-auto px-4 pb-8" style={{ maxHeight: 'calc(85vh - 32px)' }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold" style={{ color: 'var(--text)' }}>
                  Alerts · {ticker}
                </h3>
                {spot > 0 && (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Current price: ${spot.toFixed(2)}
                  </p>
                )}
              </div>
              <button onClick={onClose}><X className="w-5 h-5" style={{ color: 'var(--text-muted)' }} /></button>
            </div>

            {/* Push permission */}
            {!pushEnabled && (
              <button
                onClick={handleEnablePush}
                disabled={pushLoading}
                className="w-full flex items-center justify-center gap-2 mb-4 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc' }}>
                {pushLoading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Bell className="w-4 h-4" />}
                {pushLoading ? 'Enabling…' : 'Enable push notifications'}
              </button>
            )}
            {pushEnabled && (
              <div className="flex items-center gap-2 mb-4 text-xs" style={{ color: '#10b981' }}>
                <Bell className="w-3.5 h-3.5" />
                Push notifications enabled
              </div>
            )}

            {/* Create new alert */}
            <div className="rounded-2xl p-3 mb-4 space-y-3"
              style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
              <p className="text-xs font-semibold" style={{ color: 'var(--text-sub)' }}>New alert</p>

              {/* Condition picker */}
              <div className="grid grid-cols-2 gap-1.5">
                {CONDITIONS.map(c => (
                  <button key={c} onClick={() => setCondition(c)}
                    className="text-[11px] py-1.5 px-2 rounded-lg font-medium text-left"
                    style={condition === c
                      ? { background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc' }
                      : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}>
                    {CONDITION_LABELS[c]}
                  </button>
                ))}
              </div>

              {/* Threshold input */}
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={threshold}
                  onChange={e => setThreshold(e.target.value)}
                  placeholder="Value"
                  className="flex-1 rounded-xl px-3 py-2 text-sm font-mono"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(99,102,241,0.25)',
                    color: 'var(--text)',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={handleCreate}
                  disabled={createAlert.isPending || !threshold}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold"
                  style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7' }}>
                  {createAlert.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Add
                </button>
              </div>
            </div>

            {/* Existing alerts for this ticker */}
            {tickerAlerts.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Active alerts</p>
                {tickerAlerts.map(alert => (
                  <div key={alert.id}
                    className="flex items-center justify-between rounded-xl px-3 py-2.5"
                    style={{
                      background: alert.triggered ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${alert.triggered ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.08)'}`,
                    }}>
                    <div>
                      <p className="text-[11px] font-semibold" style={{ color: alert.triggered ? '#f87171' : 'var(--text-sub)' }}>
                        {CONDITION_LABELS[alert.condition]} {alert.condition.includes('pct') ? `${alert.threshold}%` : `$${alert.threshold}`}
                      </p>
                      {alert.triggered && (
                        <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                          Triggered {alert.last_triggered_at ? new Date(alert.last_triggered_at).toLocaleString() : ''}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {alert.triggered && (
                        <button onClick={() => resetAlert.mutate(alert.id)} title="Re-arm">
                          <RefreshCw className="w-3.5 h-3.5" style={{ color: '#f59e0b' }} />
                        </button>
                      )}
                      {!alert.triggered && (
                        <BellOff className="w-3.5 h-3.5" style={{ color: '#10b981' }} />
                      )}
                      <button onClick={() => deleteAlert.mutate(alert.id)}>
                        <Trash2 className="w-3.5 h-3.5" style={{ color: '#ef4444' }} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tickerAlerts.length === 0 && (
              <p className="text-center text-xs py-4" style={{ color: 'var(--text-muted)' }}>
                No alerts set for {ticker}
              </p>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
