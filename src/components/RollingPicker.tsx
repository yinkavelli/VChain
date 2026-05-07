import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

interface Props {
  items: string[]
  selected: string
  onChange: (val: string) => void
  formatLabel?: (val: string) => string
  width?: number
}

const ITEM_H = 28

export function RollingPicker({ items, selected, onChange, formatLabel, width = 120 }: Props) {
  const idx     = Math.max(0, items.indexOf(selected))
  const listRef = useRef<HTMLDivElement>(null)
  const [_dragging] = useState(false)

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTo({ top: idx * ITEM_H, behavior: 'smooth' })
    }
  }, [idx])

  function onScroll() {
    if (!listRef.current) return
    const newIdx = Math.round(listRef.current.scrollTop / ITEM_H)
    const clamped = Math.max(0, Math.min(items.length - 1, newIdx))
    if (items[clamped] !== selected) onChange(items[clamped])
  }

  return (
    <div className="relative flex-shrink-0" style={{ width, height: ITEM_H * 3 }}>
      {/* Gradient overlays top/bottom */}
      <div className="absolute inset-x-0 top-0 h-7 z-10 pointer-events-none rounded-t-xl"
        style={{ background: 'linear-gradient(to bottom, var(--bg-card-alt), transparent)' }} />
      <div className="absolute inset-x-0 bottom-0 h-7 z-10 pointer-events-none rounded-b-xl"
        style={{ background: 'linear-gradient(to top, var(--bg-card-alt), transparent)' }} />
      {/* Selection highlight */}
      <div className="absolute inset-x-0 z-0 rounded-lg"
        style={{ top: ITEM_H, height: ITEM_H, background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.3)' }} />
      {/* Scrollable list */}
      <div
        ref={listRef}
        onScroll={onScroll}
        className="h-full overflow-y-auto no-scrollbar snap-y snap-mandatory relative z-0"
        style={{ scrollSnapType: 'y mandatory' }}>
        {/* padding top/bottom so first/last items can center */}
        <div style={{ height: ITEM_H }} />
        {items.map((item) => (
          <div key={item}
            style={{ height: ITEM_H, scrollSnapAlign: 'center' }}
            className="flex items-center justify-center cursor-pointer"
            onClick={() => onChange(item)}>
            <motion.span
              animate={{ opacity: item === selected ? 1 : 0.35, scale: item === selected ? 1 : 0.88 }}
              transition={{ duration: 0.15 }}
              className={`text-xs font-mono font-semibold select-none ${
                item === selected ? 'text-blue-300' : 'text-slate-500'
              }`}>
              {formatLabel ? formatLabel(item) : item}
            </motion.span>
          </div>
        ))}
        <div style={{ height: ITEM_H }} />
      </div>
    </div>
  )
}
