import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Send, BrainCircuit, RefreshCw, Trash2, History, X, Share2, Copy, Check } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import type { StrategyScreenResult } from '../hooks/useStrategyScreener'
import { useAdvisorChats } from '../hooks/useAdvisorChats'
import type { AdvisorChat } from '../hooks/useAdvisorChats'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
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
  user?: User | null
}

const SUGGESTIONS = [
  'Which trades have the best risk/reward right now?',
  'Top iron condor vs covered call opportunities?',
  'What sector has the best options edge today?',
  'Size me into 3 trades for a $50k account',
]

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button onClick={handleCopy}
      className="flex items-center gap-1 mt-2.5 text-[10px] font-medium transition-colors"
      style={{ color: copied ? '#10b981' : 'var(--text-muted)' }}>
      {copied
        ? <><Check className="w-3 h-3" /> Copied</>
        : <><Copy className="w-3 h-3" /> Copy</>}
    </button>
  )
}

// Parse and render markdown cleanly — no raw ##, **, - syntax shown to user
function MarcusText({ text }: { text: string }) {
  const nodes: React.ReactNode[] = []
  const lines = text.split('\n')

  lines.forEach((line, i) => {
    const raw = line

    // Blank line
    if (!raw.trim()) {
      nodes.push(<div key={i} className="h-2" />)
      return
    }

    // H3 ###
    if (/^###\s+/.test(raw)) {
      nodes.push(
        <p key={i} className="text-[13px] font-bold mt-3 mb-0.5" style={{ color: 'var(--text)' }}>
          {renderInline(raw.replace(/^###\s+/, ''))}
        </p>
      )
      return
    }

    // H2 ##
    if (/^##\s+/.test(raw)) {
      nodes.push(
        <p key={i} className="text-sm font-bold mt-4 mb-1" style={{ color: 'var(--text)' }}>
          {renderInline(raw.replace(/^##\s+/, ''))}
        </p>
      )
      return
    }

    // H1 #
    if (/^#\s+/.test(raw)) {
      nodes.push(
        <p key={i} className="text-sm font-bold mt-4 mb-1" style={{ color: 'var(--text)' }}>
          {renderInline(raw.replace(/^#\s+/, ''))}
        </p>
      )
      return
    }

    // Horizontal rule
    if (/^[─═\-]{3,}$/.test(raw.trim())) {
      nodes.push(<hr key={i} className="my-2 border-0 border-t" style={{ borderColor: 'var(--inner-border)' }} />)
      return
    }

    // Numbered list  "1. ..."
    const numberedMatch = raw.match(/^(\d+)\.\s+(.*)/)
    if (numberedMatch) {
      nodes.push(
        <div key={i} className="flex gap-2 items-start mt-1">
          <span className="text-[12px] font-bold flex-shrink-0 mt-px w-4 text-right"
            style={{ color: 'var(--accent)' }}>{numberedMatch[1]}.</span>
          <span className="text-[13px] leading-relaxed" style={{ color: 'var(--text-sub)' }}>
            {renderInline(numberedMatch[2])}
          </span>
        </div>
      )
      return
    }

    // Bullet  "- " or "• " or "* "
    if (/^[-•*]\s/.test(raw)) {
      nodes.push(
        <div key={i} className="flex gap-2.5 items-start mt-0.5">
          <span className="mt-[7px] w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--accent)' }} />
          <span className="text-[13px] leading-relaxed" style={{ color: 'var(--text-sub)' }}>
            {renderInline(raw.slice(2))}
          </span>
        </div>
      )
      return
    }

    // Normal paragraph
    nodes.push(
      <p key={i} className="text-[13px] leading-relaxed" style={{ color: 'var(--text-sub)' }}>
        {renderInline(raw)}
      </p>
    )
  })

  return <div className="space-y-0.5">{nodes}</div>
}

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**'))
      return <strong key={i} style={{ color: 'var(--text)', fontWeight: 600 }}>{p.slice(2, -2)}</strong>
    if (p.startsWith('*') && p.endsWith('*'))
      return <em key={i}>{p.slice(1, -1)}</em>
    if (p.startsWith('`') && p.endsWith('`'))
      return <code key={i} className="text-[12px] px-1 rounded" style={{ background: 'var(--metric-bg)', color: 'var(--accent)' }}>{p.slice(1, -1)}</code>
    return p
  })
}

export function AdvisorView({ strategies, marketMetrics, sectorData, user }: Props) {
  const [messages, setMessages]             = useState<Message[]>([])
  const [streamingText, setStreamingText]   = useState('')
  const [isStreaming, setIsStreaming]        = useState(false)
  const [input, setInput]                   = useState('')
  const [loading, setLoading]               = useState(false)
  const [activeChatId, setActiveChatId]     = useState<string | null>(null)
  const [showHistory, setShowHistory]       = useState(false)
  const bottomRef   = useRef<HTMLDivElement>(null)
  const inputRef    = useRef<HTMLTextAreaElement>(null)
  const accRef      = useRef('')
  const rafRef      = useRef<number | undefined>(undefined)

  const userId = user?.id ?? null
  const { chats, remove: removeChat, save: saveChat, update: updateChat } = useAdvisorChats(userId)

  function shareChat(chat: AdvisorChat) {
    const lines = chat.messages.map(m =>
      `${m.role === 'user' ? '🧑 You' : '🤖 Marcus Chen'}:\n${m.content}`
    ).join('\n\n---\n\n')
    const text = `${chat.title}\n\n${lines}\n\n— Shared from VChain AI Advisor`

    if (navigator.share) {
      navigator.share({ title: chat.title, text }).catch(() => {})
    } else {
      navigator.clipboard.writeText(text).then(() => alert('Chat copied to clipboard!'))
    }
  }

  // Stable context ref — never re-creates sendMessage
  const contextRef = useRef({ marketMetrics, sectorData, strategies })
  useEffect(() => { contextRef.current = { marketMetrics, sectorData, strategies } }, [marketMetrics, sectorData, strategies])

  const context = useMemo(() => {
    const { marketMetrics, sectorData, strategies } = contextRef.current
    return {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])  // intentionally stable — updated via contextRef

  const sendMessage = useCallback(async (userText: string) => {
    const text = userText.trim()
    if (!text || loading) return

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    setIsStreaming(true)
    accRef.current = ''
    setStreamingText('')

    const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch('/api/advisor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Rationale-Key': import.meta.env.VITE_CRON_SECRET ?? '',
        },
        body: JSON.stringify({ messages: history, context: contextRef.current.strategies.length
          ? {
              marketMetrics: contextRef.current.marketMetrics,
              sectorData: contextRef.current.sectorData,
              topStrategies: contextRef.current.strategies.slice(0, 15).map(s => ({
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
          : context }),
      })
      if (!res.ok || !res.body) throw new Error('Request failed')

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      const flush = () => {
        setStreamingText(accRef.current)
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
              if (!rafRef.current) {
                rafRef.current = requestAnimationFrame(flush)
              }
            }
          } catch { /* skip */ }
        }
      }
      // Final flush — move into message history
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      const final = accRef.current
      const asstMsg: Message = { id: crypto.randomUUID(), role: 'assistant', content: final }
      setMessages(prev => {
        const updated = [...prev, asstMsg]
        // Persist to Supabase
        const storable = updated.map(m => ({ role: m.role, content: m.content }))
        if (activeChatId) {
          updateChat(activeChatId, storable)
        } else {
          saveChat(storable).then(id => { if (id) setActiveChatId(id) })
        }
        return updated
      })
      setStreamingText('')
    } catch {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(), role: 'assistant',
        content: 'Connection failed. Please try again.',
      }])
      setStreamingText('')
    } finally {
      setLoading(false)
      setIsStreaming(false)
    }
  }, [messages, loading, context, activeChatId, saveChat, updateChat])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) }
  }

  const showSuggestions = !loading && messages.length === 0

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100svh - 140px)' }}>

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)', boxShadow: '0 0 14px rgba(99,102,241,0.35)' }}>
            <BrainCircuit className="w-[18px] h-[18px] text-white" />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight" style={{ color: 'var(--text)' }}>Marcus Chen</p>
            <p className="text-[10px]" style={{ color: 'var(--accent)' }}>
              Senior PM · {strategies.length > 0 ? `${strategies.length} opportunities loaded` : 'Derivatives Strategy'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {chats.length > 0 && (
            <button onClick={() => setShowHistory(h => !h)}
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: showHistory ? 'rgba(99,102,241,0.15)' : 'var(--metric-bg)', border: '0.5px solid var(--inner-border)' }}>
              <History className="w-3.5 h-3.5" style={{ color: showHistory ? 'var(--accent)' : 'var(--text-muted)' }} />
            </button>
          )}
          {messages.length > 0 && (
            <button onClick={() => { setMessages([]); setStreamingText(''); setActiveChatId(null) }}
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--metric-bg)', border: '0.5px solid var(--inner-border)' }}>
              <RefreshCw className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
            </button>
          )}
        </div>
      </div>

      {/* Chat history panel */}
      {showHistory && (
        <div className="mb-4 rounded-2xl overflow-hidden"
          style={{ background: 'var(--glass-card-bg)', border: '0.5px solid var(--inner-border)' }}>
          <div className="flex items-center justify-between px-4 py-2.5"
            style={{ borderBottom: '0.5px solid var(--inner-border)' }}>
            <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Saved Chats
            </span>
            <button onClick={() => setShowHistory(false)}>
              <X className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>
          {chats.length === 0 ? (
            <p className="px-4 py-3 text-[12px]" style={{ color: 'var(--text-muted)' }}>No saved chats yet.</p>
          ) : (
            <div className="max-h-52 overflow-y-auto">
              {chats.map((chat: AdvisorChat) => (
                <div key={chat.id}
                  className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors ${activeChatId === chat.id ? 'bg-indigo-500/10' : ''}`}
                  style={{ borderBottom: '0.5px solid var(--inner-border)' }}
                  onClick={() => {
                    setMessages(chat.messages.map(m => ({ id: crypto.randomUUID(), ...m })))
                    setActiveChatId(chat.id)
                    setShowHistory(false)
                  }}>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium truncate" style={{ color: activeChatId === chat.id ? 'var(--accent)' : 'var(--text)' }}>
                      {chat.title}
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {new Date(chat.updated_at).toLocaleDateString()} · {chat.messages.length} messages
                    </p>
                  </div>
                  <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); shareChat(chat) }}
                      className="w-7 h-7 rounded-lg flex items-center justify-center"
                      style={{ background: 'rgba(99,102,241,0.1)' }}
                      title="Share chat">
                      <Share2 className="w-3 h-3" style={{ color: 'var(--accent)' }} />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); removeChat(chat.id); if (activeChatId === chat.id) { setMessages([]); setActiveChatId(null) } }}
                      className="w-7 h-7 rounded-lg flex items-center justify-center"
                      style={{ background: 'rgba(239,68,68,0.1)' }}
                      title="Delete chat">
                      <Trash2 className="w-3 h-3 text-red-400" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Message list */}
      <div className="flex-1 space-y-4 pb-4">

        {/* Empty state */}
        {messages.length === 0 && !isStreaming && (
          <div className="text-center py-6">
            <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
              Ask me anything about the current market or options opportunities.
            </p>
          </div>
        )}

        {/* History */}
        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-2.5 items-end ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center mb-0.5"
                style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)' }}>
                <BrainCircuit className="w-3 h-3 text-white" />
              </div>
            )}
            <div className={`max-w-[82%] ${msg.role === 'user' ? 'rounded-2xl rounded-br-sm px-4 py-2.5' : 'rounded-2xl rounded-tl-sm px-4 py-3'}`}
              style={msg.role === 'user'
                ? { background: 'var(--accent)', color: 'white', fontSize: 13, lineHeight: '1.55' }
                : { background: 'var(--glass-card-bg)', border: '1px solid var(--inner-border)' }}>
              {msg.role === 'user'
                ? <span style={{ fontSize: 13 }}>{msg.content}</span>
                : <>
                    <MarcusText text={msg.content} />
                    <CopyButton text={msg.content} />
                  </>}
            </div>
          </div>
        ))}

        {/* Live streaming bubble */}
        {isStreaming && (
          <div className="flex gap-2.5 items-end">
            <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center mb-0.5"
              style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)' }}>
              <BrainCircuit className="w-3 h-3 text-white" />
            </div>
            <div className="max-w-[82%] rounded-2xl rounded-tl-sm px-4 py-3"
              style={{ background: 'var(--glass-card-bg)', border: '1px solid var(--inner-border)' }}>
              {streamingText
                ? <>
                    <MarcusText text={streamingText} />
                    <span className="inline-block w-[2px] h-[13px] ml-0.5 rounded-sm align-middle"
                      style={{ background: 'var(--accent)', animation: 'pulse 1s ease-in-out infinite' }} />
                  </>
                : (
                  <div className="flex items-center gap-1.5 py-0.5">
                    {[0, 150, 300].map((d, i) => (
                      <span key={i} className="w-1.5 h-1.5 rounded-full"
                        style={{ background: 'var(--accent)', animation: `bounce 1s ease-in-out ${d}ms infinite` }} />
                    ))}
                  </div>
                )
              }
            </div>
          </div>
        )}

        {/* Suggestion chips — shown when empty OR after last response */}
        {showSuggestions && (
          <div className="pt-2 space-y-2">
            <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-muted)' }}>
              Suggested
            </p>
            {SUGGESTIONS.map(q => (
              <button key={q} onClick={() => sendMessage(q)}
                className="w-full text-left px-4 py-3 rounded-xl flex items-center justify-between gap-2 transition-opacity active:opacity-70"
                style={{ background: 'var(--metric-bg)', border: '1px solid var(--inner-border)' }}>
                <span className="text-[13px]" style={{ color: 'var(--text-sub)' }}>{q}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 16 }}>›</span>
              </button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="sticky bottom-0 pb-1 pt-2" style={{ background: 'var(--bg)' }}>
        <div className="flex items-end gap-2.5 px-3 py-2.5 rounded-2xl"
          style={{ background: 'var(--glass-card-bg)', border: '1px solid var(--inner-border)' }}>
          <textarea ref={inputRef} value={input}
            onChange={handleInputChange} onKeyDown={handleKeyDown}
            placeholder="Ask about any trade, strategy or market view…"
            rows={1} disabled={loading}
            className="flex-1 resize-none text-[13px] focus:outline-none bg-transparent leading-relaxed no-scrollbar"
            style={{ color: 'var(--text)', minHeight: 22, maxHeight: 120 }} />
          <button onClick={() => sendMessage(input)} disabled={!input.trim() || loading}
            className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all"
            style={input.trim() && !loading
              ? { background: 'linear-gradient(135deg,#6366f1,#7c3aed)', boxShadow: '0 0 12px rgba(99,102,241,0.4)' }
              : { background: 'var(--metric-bg)', opacity: 0.5 }}>
            <Send className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
        <p className="text-center text-[9px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
          AI analysis only · not financial advice
        </p>
      </div>
    </div>
  )
}
