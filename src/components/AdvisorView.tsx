import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, BrainCircuit, RefreshCw, User, Sparkles } from 'lucide-react'
import type { StrategyScreenResult } from '../hooks/useStrategyScreener'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  isOpeningPrompt?: boolean
}

interface MarketMetrics {
  sentiment: string
  avgChange: number
  advDecRatio: string
  advancers: number
  decliners: number
  spyChange: number | null
}

interface Props {
  strategies: StrategyScreenResult[]
  marketMetrics: MarketMetrics
  sectorData: { sector: string; avg: number }[]
}

const OPENING_PROMPT = `Give me your full deep-dive analysis of the current options landscape based on today's screener data. I want:

1. Your read on the macro/vol regime right now
2. Your top 3 highest-conviction trade recommendations with specific reasoning
3. Any sector rotations or themes worth positioning around
4. An overall portfolio strategy for this environment — what mix of strategies makes sense and why

Be specific and direct. Name tickers, strikes, and structures.`

const SUGGESTIONS = [
  'Which trades have the best risk/reward if vol spikes?',
  'Compare the top iron condor vs covered call opportunities',
  'What sector has the best options edge right now?',
  'Size me into 3 trades for a $50k account',
  'Which RSI setups are most compelling today?',
]

// Render assistant markdown cleanly
function MarcusText({ text, streaming }: { text: string; streaming: boolean }) {
  const lines = text.split('\n')
  const nodes: React.ReactNode[] = []

  lines.forEach((line, i) => {
    const trimmed = line.trim()
    if (!trimmed) {
      nodes.push(<div key={i} className="h-2" />)
      return
    }
    // Section divider lines
    if (/^[═─]{3,}/.test(trimmed)) {
      nodes.push(<hr key={i} className="my-2 border-0 border-t" style={{ borderColor: 'var(--inner-border)' }} />)
      return
    }
    // Numbered section headers like "1. Vol Regime"
    if (/^\d+\.\s+\*\*/.test(trimmed) || /^\*\*[^*]+\*\*$/.test(trimmed)) {
      const clean = trimmed.replace(/^\d+\.\s+/, '').replace(/\*\*(.*?)\*\*/g, '$1')
      nodes.push(
        <p key={i} className="text-sm font-bold mt-3 mb-1" style={{ color: 'var(--text)' }}>{clean}</p>
      )
      return
    }
    // Bullet points
    if (/^[-•*]\s/.test(trimmed)) {
      const clean = trimmed.slice(2).replace(/\*\*(.*?)\*\*/g, '$1')
      nodes.push(
        <div key={i} className="flex gap-2.5 items-start mt-0.5">
          <span className="mt-2 w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--accent)' }} />
          <span className="text-[13px] leading-relaxed" style={{ color: 'var(--text-sub)' }}>{clean}</span>
        </div>
      )
      return
    }
    // Normal paragraph with inline bold
    const parts = trimmed.split(/(\*\*[^*]+\*\*)/)
    nodes.push(
      <p key={i} className="text-[13px] leading-relaxed" style={{ color: 'var(--text-sub)' }}>
        {parts.map((p, j) =>
          p.startsWith('**') && p.endsWith('**')
            ? <strong key={j} style={{ color: 'var(--text)', fontWeight: 600 }}>{p.slice(2, -2)}</strong>
            : p
        )}
      </p>
    )
  })

  return (
    <div className="space-y-0.5">
      {nodes}
      {streaming && (
        <span className="inline-block w-[3px] h-[14px] ml-0.5 rounded-sm align-middle"
          style={{ background: 'var(--accent)', animation: 'pulse 1s ease-in-out infinite' }} />
      )}
    </div>
  )
}

export function AdvisorView({ strategies, marketMetrics, sectorData }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [streamingId, setStreamingId] = useState<string | null>(null)
  const [input, setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const [started, setStarted] = useState(false)
  const bottomRef   = useRef<HTMLDivElement>(null)
  const inputRef    = useRef<HTMLTextAreaElement>(null)
  const accRef      = useRef('')   // accumulate text without triggering renders
  const rafRef      = useRef<number | undefined>(undefined)

  const context = {
    marketMetrics,
    sectorData,
    topStrategies: strategies.slice(0, 15).map(s => ({
      ticker: s.ticker, type: s.type, thesis: s.thesis, score: s.score,
      ivRank: s.ivRank, ivHvRatio: s.ivHvRatio, pop: s.pop,
      premiumYield: s.premiumYield, maxProfit: s.maxProfit, maxLoss: s.maxLoss,
      dte: s.dte, breakevens: s.breakevens, edge: s.edge,
      legs: s.legs.map(l => ({
        action: l.action,
        strike: (l as any).strike ?? l.contract?.details?.strike_price ?? 0,
        type: ((l as any).type ?? l.contract?.details?.contract_type ?? '').toLowerCase(),
        expiry: ((l as any).expiry ?? l.contract?.details?.expiration_date ?? '').slice(0, 10),
        price: l.price,
      })),
    })),
  }

  const sendMessage = useCallback(async (userText: string, isOpening = false) => {
    if (!userText.trim() || loading) return
    const userMsg: Message = {
      id: crypto.randomUUID(), role: 'user', content: userText.trim(),
      isOpeningPrompt: isOpening,
    }
    const asstId = crypto.randomUUID()
    const asstMsg: Message = { id: asstId, role: 'assistant', content: '' }

    setMessages(prev => [...prev, userMsg, asstMsg])
    setStreamingId(asstId)
    setLoading(true)
    setInput('')
    accRef.current = ''

    const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch('/api/advisor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Rationale-Key': import.meta.env.VITE_CRON_SECRET ?? '',
        },
        body: JSON.stringify({ messages: history, context }),
      })
      if (!res.ok || !res.body) throw new Error('Request failed')

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      const flush = () => {
        const text = accRef.current
        setMessages(prev => prev.map(m => m.id === asstId ? { ...m, content: text } : m))
        rafRef.current = undefined
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''
        for (const part of parts) {
          if (!part.startsWith('data: ')) continue
          const data = part.slice(6).trim()
          if (data === '[DONE]') break
          try {
            const json = JSON.parse(data)
            if (json.text) {
              accRef.current += json.text
              // Batch DOM updates via RAF for smooth rendering
              if (!rafRef.current) {
                rafRef.current = requestAnimationFrame(flush)
              }
            }
          } catch { /* skip */ }
        }
      }
      // Final flush
      cancelAnimationFrame(rafRef.current!)
      flush()
    } catch {
      setMessages(prev => prev.map(m => m.id === asstId
        ? { ...m, content: 'Connection failed. Please try again.' } : m))
    } finally {
      setLoading(false)
      setStreamingId(null)
    }
  }, [messages, loading, context])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-resize textarea
  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  // ── Landing ────────────────────────────────────────────────────────────
  if (!started) {
    return (
      <div className="space-y-6 pt-2">
        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="p-card p-6 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)', boxShadow: '0 0 32px rgba(99,102,241,0.4)' }}>
            <BrainCircuit className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--text)' }}>Marcus Chen</h2>
          <p className="text-xs font-medium mb-3" style={{ color: 'var(--accent)' }}>Senior PM · Derivatives Strategy · 22 years</p>
          <p className="text-[13px] leading-relaxed mb-5" style={{ color: 'var(--text-sub)' }}>
            I have live access to your screener — {strategies.length > 0 ? `${strategies.length} opportunities loaded across the S&P 500` : 'run the screener first to load opportunities'}.
            Ask me anything or let me run a full deep-dive.
          </p>
          {strategies.length > 0 && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => { setStarted(true); sendMessage(OPENING_PROMPT, true) }}
              className="w-full py-3.5 rounded-2xl text-sm font-semibold text-white flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)', boxShadow: '0 4px 20px rgba(99,102,241,0.45)' }}>
              <Sparkles className="w-4 h-4" />
              Deep-dive current opportunities
            </motion.button>
          )}
        </motion.div>

        {/* Suggested questions */}
        <div>
          <p className="text-[10px] uppercase tracking-widest font-semibold px-1 mb-3"
            style={{ color: 'var(--text-muted)' }}>Or ask something specific</p>
          <div className="space-y-2">
            {SUGGESTIONS.map((q, i) => (
              <motion.button key={q}
                initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => { setStarted(true); sendMessage(q) }}
                className="p-card w-full text-left px-4 py-3.5 flex items-center justify-between gap-3"
                whileTap={{ scale: 0.98 }}>
                <span className="text-[13px]" style={{ color: 'var(--text-sub)' }}>{q}</span>
                <span className="text-lg flex-shrink-0" style={{ color: 'var(--text-muted)' }}>›</span>
              </motion.button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Chat ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100svh - 140px)' }}>

      {/* Compact header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)', boxShadow: '0 0 14px rgba(99,102,241,0.4)' }}>
            <BrainCircuit className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight" style={{ color: 'var(--text)' }}>Marcus Chen</p>
            <p className="text-[10px]" style={{ color: 'var(--accent)' }}>Senior PM · Derivatives Strategy</p>
          </div>
        </div>
        <button onClick={() => { setMessages([]); setStarted(false) }}
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: 'var(--btn-inactive-bg)', border: '1px solid var(--btn-inactive-border)' }}
          title="New conversation">
          <RefreshCw className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-5 pb-4">
        <AnimatePresence initial={false}>
          {messages.map(msg => {
            const isUser = msg.role === 'user'
            const isStreaming = msg.id === streamingId

            if (isUser) {
              // Opening prompt — show as a compact pill, not the full wall of text
              if (msg.isOpeningPrompt) {
                return (
                  <motion.div key={msg.id}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    className="flex justify-end">
                    <div className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium text-white"
                      style={{ background: 'var(--accent)', boxShadow: '0 2px 12px var(--accent-glow)' }}>
                      <Sparkles className="w-3 h-3" />
                      Deep-dive analysis
                    </div>
                  </motion.div>
                )
              }
              return (
                <motion.div key={msg.id}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className="flex justify-end gap-2.5 items-end">
                  <div className="max-w-[78%] px-4 py-3 rounded-2xl rounded-br-sm text-[13px] leading-relaxed text-white"
                    style={{ background: 'var(--accent)', boxShadow: '0 2px 16px var(--accent-glow)' }}>
                    {msg.content}
                  </div>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mb-0.5"
                    style={{ background: 'var(--metric-bg)', border: '1px solid var(--metric-border)' }}>
                    <User className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                  </div>
                </motion.div>
              )
            }

            // Assistant message
            return (
              <motion.div key={msg.id}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                className="flex gap-2.5 items-start">
                <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
                  style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)', boxShadow: '0 0 10px rgba(99,102,241,0.35)' }}>
                  <BrainCircuit className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  {msg.content ? (
                    <div className="p-card px-4 py-4 rounded-2xl rounded-tl-sm">
                      <MarcusText text={msg.content} streaming={isStreaming} />
                    </div>
                  ) : (
                    // Typing indicator
                    <div className="p-card px-4 py-3.5 rounded-2xl rounded-tl-sm inline-flex items-center gap-1.5">
                      {[0, 0.15, 0.3].map((d, i) => (
                        <span key={i} className="w-1.5 h-1.5 rounded-full"
                          style={{ background: 'var(--accent)', animation: `bounce 1s ease-in-out ${d}s infinite` }} />
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>

        {/* Follow-up chips */}
        {!loading && messages.length >= 2 && messages[messages.length - 1].role === 'assistant' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-wrap gap-2 pl-9">
            {SUGGESTIONS.slice(0, 3).map(q => (
              <button key={q} onClick={() => sendMessage(q)}
                className="text-[11px] px-3 py-1.5 rounded-full transition-all"
                style={{ background: 'var(--btn-inactive-bg)', border: '1px solid var(--btn-inactive-border)', color: 'var(--btn-inactive-text)' }}>
                {q}
              </button>
            ))}
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="sticky bottom-0 pt-3 pb-1" style={{ background: 'var(--bg)' }}>
        <div className="p-card flex items-end gap-3 px-4 py-3">
          <textarea ref={inputRef} value={input}
            onChange={handleInputChange} onKeyDown={handleKeyDown}
            placeholder="Ask about any trade, strategy, or market view…"
            rows={1} disabled={loading}
            className="flex-1 resize-none text-[13px] focus:outline-none bg-transparent leading-relaxed"
            style={{ color: 'var(--text)', minHeight: 22, maxHeight: 120 }} />
          <button onClick={() => sendMessage(input)} disabled={!input.trim() || loading}
            className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all"
            style={input.trim() && !loading
              ? { background: 'var(--accent)', boxShadow: '0 0 14px var(--accent-glow)' }
              : { background: 'var(--btn-inactive-bg)', opacity: 0.45 }}>
            <Send className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
        <p className="text-center text-[9px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
          AI analysis only · not financial advice · all trades carry risk
        </p>
      </div>
    </div>
  )
}
