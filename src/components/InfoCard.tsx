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
          className="w-full max-w-lg rounded-t-3xl border-t border-x border-indigo-900/40 overflow-hidden"
          style={{ background: 'linear-gradient(160deg,#1a1a3e 0%,#0a0a18 100%)' }}>
          <div className="p-[1px] rounded-t-3xl"
            style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed,#4f46e5)' }}>
            <div className="rounded-t-3xl overflow-hidden"
              style={{ background: 'linear-gradient(160deg,#1a1a3e 0%,#0a0a18 100%)' }}>
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 bg-slate-600 rounded-full" />
              </div>
              <div className="px-5 pb-8 max-h-[70svh] overflow-y-auto">
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-base font-bold text-white pr-4">{title}</h3>
                  <button onClick={onClose}
                    className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 flex-shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed mb-4">{body}</p>
                <div className="rounded-xl bg-indigo-950/40 border border-indigo-800/30 p-3 mb-3">
                  <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1">How to use</p>
                  <p className="text-xs text-slate-300 leading-relaxed">{how}</p>
                </div>
                <div className="rounded-xl bg-slate-800/40 border border-slate-700/30 p-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Signal</p>
                  <p className="text-xs text-slate-300 leading-relaxed">{signal}</p>
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
