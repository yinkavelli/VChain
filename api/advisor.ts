// POST /api/advisor
// Streaming hedge-fund AI advisor with full screener context injected

import Anthropic from '@anthropic-ai/sdk'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const ALLOWED_ORIGINS = [
  'https://vchain-theta.vercel.app',
  'https://vchain.vercel.app',
]

interface StrategySnap {
  ticker: string
  type: string
  thesis: string
  score: number
  ivRank: number
  ivHvRatio: number
  pop: number
  premiumYield: number
  maxProfit: number
  maxLoss: number
  dte: number
  breakevens: number[]
  edge: string
  legs: { action: string; strike: number; type: string; expiry: string; price: number }[]
}

interface MarketMetrics {
  sentiment: string
  avgChange: number
  advDecRatio: string
  advancers: number
  decliners: number
  spyChange: number | null
}

interface SectorSnap { sector: string; avg: number }

interface AdvisorRequest {
  messages: { role: 'user' | 'assistant'; content: string }[]
  context: {
    marketMetrics: MarketMetrics
    sectorData: SectorSnap[]
    topStrategies: StrategySnap[]
  }
}

function buildSystemPrompt(ctx: AdvisorRequest['context']): string {
  const { marketMetrics: m, sectorData, topStrategies } = ctx

  const marketBlock = `
CURRENT MARKET SNAPSHOT
─────────────────────────
Sentiment    : ${m.sentiment}
Equal-wt avg : ${m.avgChange >= 0 ? '+' : ''}${m.avgChange.toFixed(2)}%
SPY change   : ${m.spyChange !== null ? `${m.spyChange >= 0 ? '+' : ''}${m.spyChange.toFixed(2)}%` : 'N/A'}
A/D Ratio    : ${m.advDecRatio}  (${m.advancers} up / ${m.decliners} down)`

  const sectorBlock = `
SECTOR PERFORMANCE (today, equal-weighted avg)
─────────────────────────────────────────────
${sectorData
  .map(s => `${s.sector.padEnd(12)} ${s.avg >= 0 ? '+' : ''}${s.avg.toFixed(2)}%`)
  .join('\n')}`

  const stratBlock = topStrategies.slice(0, 12).map((s, i) => {
    const legs = s.legs.map(l => `  ${l.action} $${l.strike} ${l.type.toUpperCase()} exp ${l.expiry} @ $${l.price.toFixed(3)}`).join('\n')
    return `
[${i + 1}] ${s.ticker} — ${s.type} (Score ${s.score})
    Thesis: ${s.thesis} | DTE: ${s.dte} | PoP: ${s.pop}% | Yield/yr: ${s.premiumYield > 0 ? s.premiumYield.toFixed(0) + '%' : '—'}
    IVR: ${s.ivRank} | IV/HV: ${s.ivHvRatio.toFixed(2)}x | BEs: ${s.breakevens.map(b => '$' + b.toFixed(2)).join(' / ')}
    Max Profit: ${s.maxProfit === Infinity ? 'unlimited' : '$' + (s.maxProfit * 100).toFixed(0)} | Max Loss: ${s.maxLoss === Infinity ? 'unlimited' : '$' + (s.maxLoss * 100).toFixed(0)}
    Edge: ${s.edge}
    Legs:\n${legs}`
  }).join('\n')

  return `You are Marcus Chen, a senior derivatives portfolio manager with 22 years of experience running volatility and options overlay strategies at tier-1 hedge funds (Two Sigma, Citadel). You currently manage a $500M options book and are known for synthesising vol surface dynamics, technical momentum, and macro regime analysis into precise, high-conviction trade recommendations.

You have real-time access to VChain, an S&P 500 options screener. Here is its live data:

═══════════════════════════════════════════
${marketBlock}
${sectorBlock}

TOP SCREENED OPPORTUNITIES
─────────────────────────────────────────────
${stratBlock}

SCREENER METHODOLOGY
─────────────────────────────────────────────
Score formula: IV Rank 25% + IV/HV ratio 25% + annualised yield 25% + PoP 15% + DTE sweet spot (14–45d) 10%
IV Rank: 0–100, where current IV sits in its 52-week range
IV/HV Ratio: implied vol ÷ 30-day realised vol — above 1.2x means options are overpriced vs realised, edge for sellers
PoP: probability of profit estimated from option delta
Strategy types: Covered Call, Cash-Secured Put, Bull Call Spread, Bear Put Spread, Long Straddle, Iron Condor
═══════════════════════════════════════════

YOUR COMMUNICATION STYLE
• Direct and opinionated — lead with your view, support with data
• Specific: name tickers, strikes, expiries, dollar amounts
• Think in portfolio construction terms, not isolated trades
• Distinguish between high-conviction and speculative ideas
• Acknowledge key risks without being paralysed by them
• Use professional options/vol terminology naturally
• Format responses with clear sections when doing a full analysis
• For quick follow-up questions, be concise — 2-4 sentences is fine
• Never give generic disclaimers ("consult a financial advisor" etc.) — the user is a sophisticated trader who understands risk`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin ?? ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Rationale-Key')
  res.setHeader('Vary', 'Origin')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const cronSecret = process.env.VITE_CRON_SECRET?.trim()
  const reqSecret  = (req.headers['x-rationale-key'] as string | undefined)?.trim()
  if (cronSecret && reqSecret !== cronSecret) return res.status(403).json({ error: 'Forbidden' })

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' })

  const body = req.body as Partial<AdvisorRequest>
  if (!body.messages || !body.context) return res.status(400).json({ error: 'messages and context required' })

  const systemPrompt = buildSystemPrompt(body.context)

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('X-Accel-Buffering', 'no')

  try {
    const client = new Anthropic({ apiKey })
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: systemPrompt,
      messages: body.messages,
    })

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
      }
    }
    res.write('data: [DONE]\n\n')
    res.end()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`)
    res.end()
  }
}
