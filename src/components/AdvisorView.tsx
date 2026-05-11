import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, BrainCircuit, RefreshCw, User } from 'lucide-react'
import type { StrategyScreenResult } from '../hooks/useStrategyScreener'
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
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

const SUGGESTED_QUESTIONS = [
  'Which trades have the best risk/reward if vol spikes?',
  'Compare the top iron condor vs covered call opportunities',
  'What sector has the best options edge right now?',
  'Which RSI setups are most compelling today?',
  'Size me into 3 trades for a $50k account',
]

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>

      {/* Avatar */}
      <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5"
        style={isUser
          ? { background: 'var(--accent)', boxShadow: '0 0 12px var(--accent-glow)' }
          : { background: 'linear-gradient(135deg,#6366f1,#7c3aed)', boxShadow: '0 0 12px rgba(99,102,241,0.4)' }}>
        {isUser
          ? <User className="w-3.5 h-3.5 text-white" />
          : <BrainCircuit className="w-3.5 h-3.5 text-white" />}
      </div>

      {/* Bubble */}
      <div className={`max-w-[85%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${isUser ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}
          style={isUser
            ? { background: 'var(--accent)', color: '#fff', boxShadow: '0 2px 12px var(--accent-glow)' }
            : { background: 'var(--glass-card-bg)', border: '1px solid var(--inner-border)', color: 'var(--text)', boxShadow: 'var(--card-shadow-glow)' }}>
          <FormattedContent content={msg.content} streaming={msg.streaming} />
        </div>
      </div>
    </motion.div>
  )
}

function FormattedContent({ content, streaming }: { content: string; streaming?: boolean }) {
  // Convert markdown-ish formatting to JSX
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('## ') || line.startsWith('═') || line.startsWith('─')) {
      elements.push(
        <div key={i} className="text-[10px] uppercase tracking-widest font-bold mt-3 mb-1 opacity-60"
          style={{ color: 'var(--accent)' }}>{line.replace(/^#+\s*/, '').replace(/[═─]/g, '').trim()}</div>
      )
    } else if (line.match(/^\d+\.\s+\*\*/) || line.match(/^\*\*/) ) {
      const text = line.replace(/\*\*(.*?)\*\*/g, '$1')
      elements.push(<p key={i} className="font-semibold mt-2" style={{ color: 'var(--text)' }}>{text}</p>)
    } else if (line.startsWith('• ') || line.startsWith('- ') || line.startsWith('* ')) {
      const text = line.slice(2).replace(/\*\*(.*?)\*\*/g, '$1')
      elements.push(
        <div key={i} className="flex gap-2 mt-0.5">
          <span className="flex-shrink-0 mt-1.5 w-1 h-1 rounded-full" style={{ background: 'var(--accent)' }} />
          <span className="text-sm leading-relaxed" style={{ color: 'var(--text-sub)' }}>{text}</span>
        </div>
      )
    } else if (line.trim() === '') {
      if (elements.length > 0) elements.push(<div key={i} className="h-1" />)
    } else {
      const text = line.replace(/\*\*(.*?)\*\*/g, '$1')
      elements.push(<p key={i} className="text-sm leading-relaxed" style={{ color: 'var(--text-sub)' }}>{text}</p>)
    }
    i++
  }

  return (
    <div className="space-y-0.5">
      {elements}
      {streaming && (
        <span className="inline-block w-1.5 h-4 ml-0.5 rounded-sm animate-pulse"
          style={{ background: 'var(--accent)', verticalAlign: 'text-bottom' }} />
      )}
    </div>
  )
}

export function AdvisorView({ strategies, marketMetrics, sectorData }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [started, setStarted]   = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  const context = {
    marketMetrics,
    sectorData,
    topStrategies: strategies.slice(0, 15).map(s => ({
      ticker:        s.ticker,
      type:          s.type,
      thesis:        s.thesis,
      score:         s.score,
      ivRank:        s.ivRank,
      ivHvRatio:     s.ivHvRatio,
      pop:           s.pop,
      premiumYield:  s.premiumYield,
      maxProfit:     s.maxProfit,
      maxLoss:       s.maxLoss,
      dte:           s.dte,
      breakevens:    s.breakevens,
      edge:          s.edge,
      legs: s.legs.map(l => ({
        action: l.action,
        strike: (l as any).strike ?? l.contract?.details?.strike_price ?? 0,
        type:   ((l as any).type ?? l.contract?.details?.contract_type ?? '').toLowerCase(),
        expiry: ((l as any).expiry ?? l.contract?.details?.expiration_date ?? '').slice(0, 10),
        price:  l.price,
      })),
    })),
  }

  const sendMessage = useCallback(async (userText: string) => {
    if (!userText.trim() || loading) return
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: userText.trim() }
    const asstId = crypto.randomUUID()
    const asstMsg: Message = { id: asstId, role: 'assistant', content: '', streaming: true }

    setMessages(prev => [...prev, userMsg, asstMsg])
    setLoading(true)
    setInput('')

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
      let buffer    = ''
      let full      = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''
        for (const part of parts) {
          if (!part.startsWith('data: ')) continue
          const data = part.slice(6).trim()
          if (data === '[DONE]') break
          try {
            const json = JSON.parse(data)
            if (json.text) {
              full += json.text
              setMessages(prev => prev.map(m => m.id === asstId ? { ...m, content: full } : m))
            }
          } catch { /* skip malformed */ }
        }
      }
      setMessages(prev => prev.map(m => m.id === asstId ? { ...m, streaming: false } : m))
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === asstId
        ? { ...m, content: 'Failed to reach the advisor. Please try again.', streaming: false }
        : m))
    } finally {
      setLoading(false)
    }
  }, [messages, loading, context])

  // Auto-scroll on new content
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  function handleStart() {
    setStarted(true)
    sendMessage(OPENING_PROMPT)
  }

  function handleSuggestion(q: string) {
    setInput(q)
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  // Landing screen
  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center space-y-6">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)', boxShadow: '0 0 32px rgba(99,102,241,0.45)' }}>
            <BrainCircuit className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--text)' }}>AI Advisor</h2>
          <p className="text-sm mb-1" style={{ color: 'var(--text-sub)' }}>Top-tier derivatives PM, live on your screener</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {strategies.length > 0 ? `${strategies.length} live opportunities loaded` : 'Run the screener first to load opportunities'}
          </p>
        </motion.div>

        {strategies.length > 0 && (
          <motion.button
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            onClick={handleStart}
            className="px-6 py-3 rounded-2xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)', boxShadow: '0 4px 20px rgba(99,102,241,0.4)' }}>
            Deep-dive current opportunities →
          </motion.button>
        )}

        {strategies.length === 0 && (
          <p className="text-xs p-4 rounded-2xl" style={{ background: 'var(--metric-bg)', color: 'var(--text-muted)', border: '1px solid var(--metric-border)' }}>
            Go to the Screener tab and wait for results to load, then come back here for your analysis.
          </p>
        )}

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
          className="w-full space-y-2">
          <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Or ask a specific question</p>
          {SUGGESTED_QUESTIONS.map(q => (
            <button key={q} onClick={() => { setStarted(true); sendMessage(q) }}
              className="p-card-sm w-full text-left px-4 py-3 text-xs"
              style={{ color: 'var(--text-sub)' }}>
              {q}
            </button>
          ))}
        </motion.div>
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100svh - 140px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)', boxShadow: '0 0 12px rgba(99,102,241,0.4)' }}>
            <BrainCircuit className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Marcus Chen</p>
            <p className="text-[10px]" style={{ color: 'var(--accent)' }}>Senior PM · Derivatives Strategy</p>
          </div>
        </div>
        <button onClick={() => { setMessages([]); setStarted(false) }}
          className="p-1.5 rounded-lg" title="New conversation"
          style={{ background: 'var(--btn-inactive-bg)', border: '1px solid var(--btn-inactive-border)' }}>
          <RefreshCw className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      {/* Message list */}
      <div className="flex-1 space-y-4 overflow-y-auto no-scrollbar pb-4">
        <AnimatePresence initial={false}>
          {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
        </AnimatePresence>

        {/* Suggested follow-ups after first response */}
        {!loading && messages.length >= 2 && messages[messages.length - 1].role === 'assistant' && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-wrap gap-2 pt-2">
            {SUGGESTED_QUESTIONS.slice(0, 3).map(q => (
              <button key={q} onClick={() => handleSuggestion(q)}
                className="text-[11px] px-3 py-1.5 rounded-full"
                style={{ background: 'var(--btn-inactive-bg)', border: '1px solid var(--btn-inactive-border)', color: 'var(--btn-inactive-text)' }}>
                {q}
              </button>
            ))}
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="sticky bottom-0 pt-3" style={{ background: 'var(--bg)' }}>
        <div className="p-card flex items-end gap-3 px-4 py-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about any opportunity, strategy, or market view…"
            rows={1}
            disabled={loading}
            className="flex-1 resize-none text-sm focus:outline-none bg-transparent leading-relaxed"
            style={{ color: 'var(--text)', maxHeight: 120 }}
          />
          <button onClick={() => sendMessage(input)} disabled={!input.trim() || loading}
            className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all"
            style={input.trim() && !loading
              ? { background: 'var(--accent)', boxShadow: '0 0 12px var(--accent-glow)' }
              : { background: 'var(--btn-inactive-bg)', opacity: 0.5 }}>
            <Send className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
        <p className="text-center text-[9px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
          AI analysis only — not financial advice. All trades carry risk.
        </p>
      </div>
    </div>
  )
}
