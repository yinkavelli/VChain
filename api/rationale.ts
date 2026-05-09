// Vercel serverless function — AI Trade Rationale
// POST /api/rationale
// Body: { ticker, strategy, iv_rank, iv_hv_ratio, price_trend, dte }

import Anthropic from '@anthropic-ai/sdk'
import type { VercelRequest, VercelResponse } from '@vercel/node'

interface RationaleRequest {
  ticker: string
  strategy: string
  iv_rank: number
  iv_hv_ratio: number
  price_trend: string   // e.g. "Bullish" | "Bearish" | "Neutral" | "Sell Premium" | "Buy Vol"
  dte: number
}

const ALLOWED_ORIGINS = [
  'https://vchain-theta.vercel.app',
  'https://vchain.vercel.app',
]

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Restrict CORS to known frontend origins only
  const origin = req.headers.origin ?? ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0]
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Rationale-Key')
  res.setHeader('Vary', 'Origin')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Verify shared secret so only our frontend can trigger AI calls
  const cronSecret = process.env.VITE_CRON_SECRET?.trim()
  const reqSecret  = (req.headers['x-rationale-key'] as string | undefined)?.trim()
  if (cronSecret && reqSecret !== cronSecret) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY env var' })
  }

  const body = req.body as Partial<RationaleRequest>

  const { ticker, strategy, iv_rank, iv_hv_ratio, price_trend, dte } = body

  if (!ticker || !strategy) {
    return res.status(400).json({ error: 'ticker and strategy are required' })
  }

  const safeIVR    = iv_rank    ?? 0
  const safeRatio  = iv_hv_ratio ?? 0
  const safeTrend  = price_trend ?? 'Neutral'
  const safeDTE    = dte        ?? 30

  // Determine vol regime label for the prompt
  const volRegime =
    safeIVR >= 70 ? 'elevated (IVR ≥ 70)' :
    safeIVR >= 50 ? 'moderately elevated (IVR 50–69)' :
    safeIVR >= 30 ? 'average (IVR 30–49)' :
                    'low (IVR < 30)'

  const ivHvLabel =
    safeRatio >= 1.5 ? 'significantly overpriced vs recent realised vol' :
    safeRatio >= 1.2 ? 'moderately overpriced vs recent realised vol' :
    safeRatio >= 0.9 ? 'in line with recent realised vol' :
                       'underpriced vs recent realised vol (cheap options)'

  const dteLabel =
    safeDTE <= 14  ? 'very short dated' :
    safeDTE <= 30  ? 'in the theta-decay sweet spot (21–30 DTE)' :
    safeDTE <= 45  ? 'in the standard selling window (31–45 DTE)' :
                     'longer dated'

  const prompt =
    `You are a concise, expert options strategist. Generate a 2–3 sentence explanation of why the ${strategy} trade on ${ticker} makes sense RIGHT NOW based on these signals:

- IV Rank: ${safeIVR} — ${volRegime}
- IV/HV Ratio: ${safeRatio.toFixed(2)}× — ${ivHvLabel}
- Price Trend/Thesis: ${safeTrend}
- Days to Expiry: ${safeDTE} — ${dteLabel}

Focus on the "why this trade, why now" angle. Be specific to the signals above. No fluff, no disclaimers, no bullet points — just 2–3 flowing sentences as if you are briefing a sophisticated trader.`

  try {
    const client = new Anthropic({ apiKey })

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    })

    const textBlock = message.content.find(b => b.type === 'text')
    const rationale = textBlock?.type === 'text' ? textBlock.text.trim() : ''

    return res.status(200).json({ rationale })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(502).json({ error: 'AI generation failed', message })
  }
}
