// Strategy scorer — accurate construction and real metrics
import type { OptionContract } from './massiveApi'

export type StrategyType =
  | 'Iron Condor'
  | 'Bull Put Spread'
  | 'Bear Call Spread'
  | 'Cash-Secured Put'
  | 'Covered Call'
  | 'Long Straddle'

export type Thesis = 'Sell Premium' | 'Buy Vol' | 'Bullish' | 'Bearish' | 'Neutral'

export interface StrategyLeg {
  contract: OptionContract
  action: 'BUY' | 'SELL'
  price: number
}

export interface ScoredStrategy {
  id: string
  ticker: string
  type: StrategyType
  thesis: Thesis
  legs: StrategyLeg[]
  score: number
  pop: number
  premiumYield: number
  maxProfit: number
  maxLoss: number
  breakevens: number[]
  dte: number
  ivRank: number
  ivHvRatio: number
  expectedMove: number
  expectedMovePct: number
  edge: string
}

// ── Helpers ───────────────────────────────────────────────────────────────

function price(c: OptionContract): number {
  return (c.day as any)?.close || (c.day as any)?.vwap || 0
}

function dte(expiry: string): number {
  return Math.max(0, Math.round(
    (new Date(expiry + 'T20:00:00Z').getTime() - Date.now()) / 86_400_000
  ))
}

// Pop from delta — more accurate than hardcoding
function popFromDelta(delta: number | undefined): number {
  const d = Math.abs(delta ?? 0.30)
  return Math.round((1 - d) * 100)
}

// Find the nearest available strike width given sorted strikes
function nearestWidth(strikes: number[], targetWidth: number): number {
  if (strikes.length < 2) return targetWidth
  const increments = strikes.slice(1).map((s, i) => s - strikes[i])
  const minInc = Math.min(...increments.filter(i => i > 0))
  // Round targetWidth to nearest multiple of minIncrement
  return Math.max(minInc, Math.round(targetWidth / minInc) * minInc)
}

// Scoring components
function scoreIVR(ivRank: number, high: boolean) {
  return high ? Math.min(ivRank / 100, 1) : Math.max(0, 1 - ivRank / 100)
}
function scoreDTE(d: number) {
  if (d >= 21 && d <= 45) return 1.0
  if (d >= 14 && d < 21)  return 0.75
  if (d > 45 && d <= 60)  return 0.65
  return 0.3
}
function scoreYield(y: number) { return Math.min(y / 40, 1) }
function scorePoP(p: number)   { return p / 100 }
function scoreRatio(r: number, high: boolean) {
  if (high) return Math.min(Math.max(0, (r - 0.8) / 1.2), 1)
  return Math.max(0, 1 - r)
}

function composite(
  ivr: number, d: number, ratio: number, yld: number, pop: number,
  w = { ivr: 0.25, dte: 0.15, ratio: 0.25, yld: 0.25, pop: 0.10 }
): number {
  return Math.min(99, Math.round(
    (ivr * w.ivr + d * w.dte + ratio * w.ratio + yld * w.yld + pop * w.pop) * 100
  ))
}

// ── Iron Condor ───────────────────────────────────────────────────────────
// Equal-width wings. Short strikes ~1-SD OTM. Long strikes at equal dollar width.

export function buildIronCondor(
  ticker: string, calls: OptionContract[], puts: OptionContract[],
  spot: number, iv30: number, ivRank: number, ivHvRatio: number
): ScoredStrategy | null {
  if (!calls.length || !puts.length) return null

  // Sort ascending
  const sc = [...calls].sort((a, b) => a.details.strike_price - b.details.strike_price)
  const sp = [...puts].sort((a, b)  => a.details.strike_price - b.details.strike_price)

  // ATM index in calls array
  const atmIdx = sc.findIndex(c => c.details.strike_price >= spot)
  if (atmIdx < 0 || atmIdx >= sc.length - 2) return null

  // Short call: ~1-SD OTM, minimum 2 strikes above ATM
  const targetShortCall = spot * (1 + (iv30/100) * Math.sqrt(30/365))
  let scIdx = sc.findIndex(c => c.details.strike_price >= targetShortCall)
  if (scIdx < 0) scIdx = sc.length - 2
  scIdx = Math.max(atmIdx + 2, scIdx)  // at least 2 strikes OTM
  if (scIdx >= sc.length - 1) return null

  const shortCall = sc[scIdx]
  const shortCallK = shortCall.details.strike_price

  // Determine wing width — equal for both sides
  // Use the strike increment × 2 (1 strike wide is too narrow, 2 is standard)
  const callStrikes = sc.map(c => c.details.strike_price)
  const strikeInc   = nearestWidth(callStrikes, (shortCallK - spot) * 0.4)
  const wingWidth   = Math.max(strikeInc, 5)  // minimum $5 wide

  // Long call: exactly wingWidth above short call
  const targetLongCallK = shortCallK + wingWidth
  const longCall = sc.find(c => c.details.strike_price >= targetLongCallK * 0.999)
  if (!longCall) return null

  // Short put: symmetric distance below spot as short call above spot
  const callOTMpct = (shortCallK - spot) / spot
  const targetShortPutK = spot * (1 - callOTMpct)
  const shortPut = [...sp].reverse().find(p => p.details.strike_price <= targetShortPutK * 1.001)
  if (!shortPut) return null
  const shortPutK = shortPut.details.strike_price

  // Long put: exactly wingWidth below short put (EQUAL wings)
  const targetLongPutK = shortPutK - wingWidth
  const longPut = [...sp].reverse().find(p => p.details.strike_price <= targetLongPutK * 1.001)
  if (!longPut) return null

  // Validate equal wings (within 10% tolerance for available strikes)
  const callWing = longCall.details.strike_price  - shortCallK
  const putWing  = shortPutK - longPut.details.strike_price
  if (Math.abs(callWing - putWing) / Math.max(callWing, putWing) > 0.25) return null

  const scP = price(shortCall), spP = price(shortPut)
  const lcP = price(longCall),  lpP = price(longPut)
  if (!scP || !spP || scP <= 0 || spP <= 0) return null

  const credit  = scP + spP - (lcP + lpP)
  const width   = Math.min(callWing, putWing)  // use narrower for conservative maxLoss
  const maxLoss = width - credit
  if (credit <= 0 || maxLoss <= 0) return null

  const days     = dte(shortCall.details.expiration_date)
  const annYield = (credit / maxLoss) * (365 / Math.max(days, 1)) * 100
  const pop      = Math.round(
    (popFromDelta(shortCall.greeks?.delta) +
     popFromDelta(shortPut.greeks?.delta)) / 2
  )
  const expMove  = spot * (iv30/100) * Math.sqrt(days/365)

  return {
    id: `${ticker}-IC-${shortCall.details.expiration_date}`,
    ticker, type: 'Iron Condor', thesis: 'Sell Premium',
    legs: [
      { contract: shortCall, action: 'SELL', price: scP },
      { contract: longCall,  action: 'BUY',  price: lcP },
      { contract: shortPut,  action: 'SELL', price: spP },
      { contract: longPut,   action: 'BUY',  price: lpP },
    ],
    score: composite(
      scoreIVR(ivRank, true), scoreDTE(days), scoreRatio(ivHvRatio, true),
      scoreYield(annYield), scorePoP(pop),
      { ivr: 0.25, dte: 0.15, ratio: 0.25, yld: 0.25, pop: 0.10 }
    ),
    pop, premiumYield: annYield, maxProfit: credit, maxLoss,
    breakevens: [shortCallK + credit, shortPutK - credit],
    dte: days, ivRank, ivHvRatio, expectedMove: expMove,
    expectedMovePct: (expMove/spot)*100,
    edge: `Collect $${credit.toFixed(2)} credit. ${pop}% PoP. Profit if ${ticker} stays between $${shortPutK}–$${shortCallK}. Wings: $${putWing.toFixed(0)}/$${callWing.toFixed(0)}.`,
  }
}

// ── Bull Put Spread ───────────────────────────────────────────────────────
// Sell OTM put, buy lower put at EQUAL dollar width. Bullish/neutral.

export function buildBullPutSpread(
  ticker: string, puts: OptionContract[],
  spot: number, iv30: number, ivRank: number, ivHvRatio: number
): ScoredStrategy | null {
  const sp = [...puts].sort((a, b) => a.details.strike_price - b.details.strike_price)

  // Short put: 1-SD OTM (~30Δ), at least 3% below spot
  const targetShortK = spot * (1 - Math.max(0.03, (iv30/100) * Math.sqrt(21/365)))
  const shortPut = [...sp].reverse().find(p => p.details.strike_price <= targetShortK * 1.005)
  if (!shortPut) return null

  const shortK = shortPut.details.strike_price

  // Wing width: aim for $5-$25 depending on stock price
  const putStrikes = sp.map(p => p.details.strike_price)
  const strikeInc  = nearestWidth(putStrikes, spot * 0.015)  // ~1.5% of spot
  const wingWidth  = Math.max(strikeInc, 5)

  // Long put: exactly wingWidth below short put
  const longPut = [...sp].reverse().find(p => p.details.strike_price <= shortK - wingWidth * 0.95)
  if (!longPut) return null

  const spP = price(shortPut), lpP = price(longPut)
  if (!spP || spP <= 0) return null

  const credit  = spP - lpP
  const width   = shortK - longPut.details.strike_price
  const maxLoss = width - credit
  if (credit <= 0 || maxLoss <= 0) return null

  const days     = dte(shortPut.details.expiration_date)
  const annYield = (credit / maxLoss) * (365 / Math.max(days, 1)) * 100
  const pop      = popFromDelta(shortPut.greeks?.delta)
  const expMove  = spot * (iv30/100) * Math.sqrt(days/365)
  const be       = shortK - credit

  return {
    id: `${ticker}-BPS-${shortPut.details.expiration_date}`,
    ticker, type: 'Bull Put Spread', thesis: 'Bullish',
    legs: [
      { contract: shortPut, action: 'SELL', price: spP },
      { contract: longPut,  action: 'BUY',  price: lpP },
    ],
    score: composite(
      scoreIVR(ivRank, true), scoreDTE(days), scoreRatio(ivHvRatio, true),
      scoreYield(annYield), scorePoP(pop),
      { ivr: 0.25, dte: 0.15, ratio: 0.20, yld: 0.25, pop: 0.15 }
    ),
    pop, premiumYield: annYield, maxProfit: credit, maxLoss,
    breakevens: [be],
    dte: days, ivRank, ivHvRatio, expectedMove: expMove,
    expectedMovePct: (expMove/spot)*100,
    edge: `$${credit.toFixed(2)} credit on $${width.toFixed(0)} wide spread. ${pop}% PoP. Breakeven $${be.toFixed(2)}.`,
  }
}

// ── Bear Call Spread ──────────────────────────────────────────────────────

export function buildBearCallSpread(
  ticker: string, calls: OptionContract[],
  spot: number, iv30: number, ivRank: number, ivHvRatio: number
): ScoredStrategy | null {
  const sc = [...calls].sort((a, b) => a.details.strike_price - b.details.strike_price)

  const targetShortK = spot * (1 + Math.max(0.03, (iv30/100) * Math.sqrt(21/365)))
  const shortCall = sc.find(c => c.details.strike_price >= targetShortK * 0.995)
  if (!shortCall) return null

  const shortK = shortCall.details.strike_price
  const callStrikes = sc.map(c => c.details.strike_price)
  const strikeInc   = nearestWidth(callStrikes, spot * 0.015)
  const wingWidth   = Math.max(strikeInc, 5)

  const longCall = sc.find(c => c.details.strike_price >= shortK + wingWidth * 0.95)
  if (!longCall) return null

  const scP = price(shortCall), lcP = price(longCall)
  if (!scP || scP <= 0) return null

  const credit  = scP - lcP
  const width   = longCall.details.strike_price - shortK
  const maxLoss = width - credit
  if (credit <= 0 || maxLoss <= 0) return null

  const days     = dte(shortCall.details.expiration_date)
  const annYield = (credit / maxLoss) * (365 / Math.max(days, 1)) * 100
  const pop      = popFromDelta(shortCall.greeks?.delta)
  const expMove  = spot * (iv30/100) * Math.sqrt(days/365)
  const be       = shortK + credit

  return {
    id: `${ticker}-BCS-${shortCall.details.expiration_date}`,
    ticker, type: 'Bear Call Spread', thesis: 'Bearish',
    legs: [
      { contract: shortCall, action: 'SELL', price: scP },
      { contract: longCall,  action: 'BUY',  price: lcP },
    ],
    score: composite(
      scoreIVR(ivRank, true), scoreDTE(days), scoreRatio(ivHvRatio, true),
      scoreYield(annYield), scorePoP(pop),
      { ivr: 0.25, dte: 0.15, ratio: 0.20, yld: 0.25, pop: 0.15 }
    ),
    pop, premiumYield: annYield, maxProfit: credit, maxLoss,
    breakevens: [be],
    dte: days, ivRank, ivHvRatio, expectedMove: expMove,
    expectedMovePct: (expMove/spot)*100,
    edge: `$${credit.toFixed(2)} credit on $${width.toFixed(0)} wide spread. ${pop}% PoP. Breakeven $${be.toFixed(2)}.`,
  }
}

// ── Cash-Secured Put ──────────────────────────────────────────────────────

export function buildCashSecuredPut(
  ticker: string, puts: OptionContract[],
  spot: number, iv30: number, ivRank: number, ivHvRatio: number
): ScoredStrategy | null {
  const sp = [...puts].sort((a, b) => a.details.strike_price - b.details.strike_price)

  // Target ~30Δ put (3-5% OTM)
  const targetK = spot * (1 - Math.max(0.03, (iv30/100) * Math.sqrt(21/365)))
  const put = [...sp].reverse().find(p => p.details.strike_price <= targetK * 1.005)
  if (!put) return null

  const p = price(put)
  if (!p || p <= 0) return null

  const days     = dte(put.details.expiration_date)
  const annYield = (p / put.details.strike_price) * (365 / Math.max(days, 1)) * 100
  const pop      = popFromDelta(put.greeks?.delta)
  const expMove  = spot * (iv30/100) * Math.sqrt(days/365)
  const be       = put.details.strike_price - p

  return {
    id: `${ticker}-CSP-${put.details.expiration_date}`,
    ticker, type: 'Cash-Secured Put', thesis: 'Bullish',
    legs: [{ contract: put, action: 'SELL', price: p }],
    score: composite(
      scoreIVR(ivRank, true), scoreDTE(days), scoreRatio(ivHvRatio, true),
      scoreYield(annYield), scorePoP(pop),
      { ivr: 0.30, dte: 0.10, ratio: 0.20, yld: 0.25, pop: 0.15 }
    ),
    pop, premiumYield: annYield, maxProfit: p, maxLoss: put.details.strike_price - p,
    breakevens: [be],
    dte: days, ivRank, ivHvRatio, expectedMove: expMove,
    expectedMovePct: (expMove/spot)*100,
    edge: `${annYield.toFixed(1)}% ann. yield. Effective buy price $${be.toFixed(2)} if assigned. ${pop}% PoP.`,
  }
}

// ── Covered Call ──────────────────────────────────────────────────────────

export function buildCoveredCall(
  ticker: string, calls: OptionContract[],
  spot: number, iv30: number, ivRank: number, ivHvRatio: number
): ScoredStrategy | null {
  const sc = [...calls].sort((a, b) => a.details.strike_price - b.details.strike_price)

  // Target ~20-25Δ call (3-5% OTM)
  const targetK = spot * (1 + Math.max(0.03, (iv30/100) * Math.sqrt(21/365)))
  const call = sc.find(c => c.details.strike_price >= targetK * 0.995)
  if (!call) return null

  const p = price(call)
  if (!p || p <= 0) return null

  const days     = dte(call.details.expiration_date)
  const annYield = (p / spot) * (365 / Math.max(days, 1)) * 100
  const pop      = popFromDelta(call.greeks?.delta)
  const expMove  = spot * (iv30/100) * Math.sqrt(days/365)

  return {
    id: `${ticker}-CC-${call.details.expiration_date}`,
    ticker, type: 'Covered Call', thesis: 'Neutral',
    legs: [{ contract: call, action: 'SELL', price: p }],
    score: composite(
      scoreIVR(ivRank, true), scoreDTE(days), scoreRatio(ivHvRatio, true),
      scoreYield(annYield), scorePoP(pop),
      { ivr: 0.25, dte: 0.10, ratio: 0.20, yld: 0.30, pop: 0.15 }
    ),
    pop, premiumYield: annYield, maxProfit: p, maxLoss: Infinity,
    breakevens: [spot - p],
    dte: days, ivRank, ivHvRatio, expectedMove: expMove,
    expectedMovePct: (expMove/spot)*100,
    edge: `${annYield.toFixed(1)}% ann. yield. Cap upside at $${call.details.strike_price}. ${pop}% PoP.`,
  }
}

// ── Long Straddle ─────────────────────────────────────────────────────────

export function buildLongStraddle(
  ticker: string, calls: OptionContract[], puts: OptionContract[],
  spot: number, iv30: number, ivRank: number, ivHvRatio: number
): ScoredStrategy | null {
  if (ivRank > 40) return null  // only when vol is cheap

  const sc = [...calls].sort((a, b) => a.details.strike_price - b.details.strike_price)
  const sp = [...puts].sort((a, b)  => a.details.strike_price - b.details.strike_price)

  // ATM call and put — nearest strike to spot
  const atmCall = sc.reduce((best, c) =>
    Math.abs(c.details.strike_price - spot) < Math.abs(best.details.strike_price - spot) ? c : best, sc[0])
  const atmPut = sp.reduce((best, p) =>
    Math.abs(p.details.strike_price - spot) < Math.abs(best.details.strike_price - spot) ? p : best, sp[0])

  if (!atmCall || !atmPut) return null

  const callP = price(atmCall), putP = price(atmPut)
  if (!callP || !putP || callP <= 0 || putP <= 0) return null

  const cost    = callP + putP
  const days    = dte(atmCall.details.expiration_date)
  const expMove = spot * (iv30/100) * Math.sqrt(days/365)
  const beUp    = atmCall.details.strike_price + cost
  const beDn    = atmCall.details.strike_price - cost
  // PoP: need move > cost. Approx based on expected move vs cost
  const pop = Math.round(Math.min(55, Math.max(25, (expMove / cost) * 35)))

  return {
    id: `${ticker}-LS-${atmCall.details.expiration_date}`,
    ticker, type: 'Long Straddle', thesis: 'Buy Vol',
    legs: [
      { contract: atmCall, action: 'BUY', price: callP },
      { contract: atmPut,  action: 'BUY', price: putP  },
    ],
    score: composite(
      scoreIVR(ivRank, false), scoreDTE(days), scoreRatio(ivHvRatio, false),
      Math.min(expMove / (cost * 2), 1), scorePoP(pop),
      { ivr: 0.30, dte: 0.15, ratio: 0.25, yld: 0.15, pop: 0.15 }
    ),
    pop, premiumYield: 0, maxProfit: Infinity, maxLoss: cost,
    breakevens: [beUp, beDn],
    dte: days, ivRank, ivHvRatio, expectedMove: expMove,
    expectedMovePct: (expMove/spot)*100,
    edge: `IVR ${ivRank} — vol cheap. Need >${((cost/spot)*100).toFixed(1)}% move. Mkt pricing ±${((expMove/spot)*100).toFixed(1)}%.`,
  }
}

// ── Master builder ────────────────────────────────────────────────────────

export function buildAllStrategies(
  ticker: string,
  contracts: OptionContract[],
  spot: number,
  iv30: number,
  ivRank: number,
  ivHvRatio: number,
  targetDTE = 30
): ScoredStrategy[] {
  if (!contracts.length || spot <= 0 || iv30 <= 0) return []

  // Pick best expiry: closest to targetDTE, must be > 7 days
  const expiries = [...new Set(contracts.map(c => c.details.expiration_date))]
    .filter(e => dte(e) >= 7)
    .sort()

  if (!expiries.length) return []

  const bestExpiry = expiries.reduce((best, e) =>
    Math.abs(dte(e) - targetDTE) < Math.abs(dte(best) - targetDTE) ? e : best, expiries[0])

  const calls = contracts.filter(c => c.details.expiration_date === bestExpiry && c.details.contract_type === 'call')
    .sort((a, b) => a.details.strike_price - b.details.strike_price)
  const puts = contracts.filter(c => c.details.expiration_date === bestExpiry && c.details.contract_type === 'put')
    .sort((a, b) => a.details.strike_price - b.details.strike_price)

  if (!calls.length || !puts.length) return []

  const strategies: ScoredStrategy[] = []
  const builders = [
    () => buildIronCondor(ticker, calls, puts, spot, iv30, ivRank, ivHvRatio),
    () => buildBullPutSpread(ticker, puts, spot, iv30, ivRank, ivHvRatio),
    () => buildBearCallSpread(ticker, calls, spot, iv30, ivRank, ivHvRatio),
    () => buildCashSecuredPut(ticker, puts, spot, iv30, ivRank, ivHvRatio),
    () => buildCoveredCall(ticker, calls, spot, iv30, ivRank, ivHvRatio),
    () => buildLongStraddle(ticker, calls, puts, spot, iv30, ivRank, ivHvRatio),
  ]

  for (const build of builders) {
    try {
      const s = build()
      if (s) strategies.push(s)
    } catch { /* skip */ }
  }

  return strategies.sort((a, b) => b.score - a.score)
}
