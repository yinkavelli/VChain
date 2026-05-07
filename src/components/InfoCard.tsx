import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

interface Props {
  title: string
  body: string
  how: string
  signal: string
  onClose: () => void
}

export function InfoCard({ title, body, how, signal, onClose }: Props) {
  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
        onClick={onClose}>
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          onClick={e => e.stopPropagation()}
          className="w-full max-w-lg rounded-t-3xl overflow-hidden"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-acc)', borderBottom: 'none' }}>
          <div className="p-[1px] rounded-t-3xl"
            style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed,#4f46e5)' }}>
            <div className="rounded-t-3xl overflow-hidden"
              style={{ background: 'var(--bg-card)' }}>
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border)' }} />
              </div>
              <div className="px-5 pb-8 max-h-[70svh] overflow-y-auto">
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-base font-bold pr-4" style={{ color: 'var(--text)' }}>{title}</h3>
                  <button onClick={onClose}
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--bg-card-alt)', color: 'var(--text-muted)' }}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--text-sub)' }}>{body}</p>
                <div className="rounded-xl p-3 mb-3" style={{ background: 'rgba(14,165,233,0.08)', border: '1px solid var(--border-acc)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--accent)' }}>How to use</p>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-sub)' }}>{how}</p>
                </div>
                <div className="rounded-xl p-3" style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Signal</p>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-sub)' }}>{signal}</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}
