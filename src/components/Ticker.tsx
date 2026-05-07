import { useEffect, useRef } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import type { ScreenerRow } from '../hooks/useScreener'

interface Props {
  stocks: ScreenerRow[]
}

export function Ticker({ stocks }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let x = 0
    let raf: number
    const speed = 0.6
    function tick() {
      x -= speed
      if (Math.abs(x) >= el!.scrollWidth / 2) x = 0
      el!.style.transform = `translateX(${x}px)`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [stocks.length])

  if (!stocks.length) return null

  const items = [...stocks, ...stocks] // duplicate for seamless loop

  return (
    <div className="overflow-hidden border-b border-[#1e1e3f] bg-[#080812]">
      <div ref={ref} className="flex gap-6 py-1.5 px-4 whitespace-nowrap will-change-transform">
        {items.map((s, i) => (
          <span key={`${s.ticker}-${i}`} className="flex items-center gap-1.5 text-[11px]">
            <span className="font-bold text-slate-300">{s.ticker}</span>
            <span className="font-mono text-white">
              ${(s.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className={`flex items-center gap-0.5 font-mono ${s.changePct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {s.changePct >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
              {s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(2)}%
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}
