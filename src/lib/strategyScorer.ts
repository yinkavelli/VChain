// A+ strategy scoring — real metrics, not hand-wavy heuristics
import type { OptionContract } from './massiveApi'

export type StrategyType =
  | 'Iron Condor'
  | 'Bull Put Spread'
  | 'Bear Call Spread'
  | 'Cash-Secured Put'
  | 'Covered Call'
  | 'Long Straddle'
  | 'Long Strangle'

export type Thesis = 'Sell Premium' | 'Buy Vol' | 'Bullish' | 'Bearish' | 'Neutral'

export interface StrategyLeg {
  contract: OptionContract
  action: 'BUY' | 'SELL'
  price: number   // prev close used as proxy
}

export interface ScoredStrategy {
  id: string
  ticker: string
  type: StrategyType
  thesis: Thesis
  legs: StrategyLeg[]
  score: number           // 0-100 composite
  pop: number             // probability of profit %
  premiumYield: number    // annualised return on capital %
  maxProfit: number
  maxLoss: number
  breakevens: number[]
  dte: number
  ivRank: number
  ivHvRatio: number
  expectedMove: number    // 1-SD move in $
  expectedMovePct: number // 1-SD move as %
  edge: string            // one-line edge explanation
}

function contractPrice(c: OptionContract): number {
  return (c.day as any)?.close || (c.day as any)?.vwap || 0
}

function daysToExpiry(expiry: string): number {
  return Math.max(0, Math.round((new Date(expiry).getTime() - Date.now()) / 86_400_000))
}

// Score components — each 0-1
function scoreIVR(ivRank: number, preferHigh: boolean): number {
  if (preferHigh) return Math.min(ivRank / 100, 1)
  return Math.max(0, 1 - ivRank / 100)
}

function scoreDTE(dte: number): number {
  // Sweet spot 21-45 DTE for theta selling, 14-30 for buying
  if (dte >= 21 && dte <= 45) return 1
  if (dte >= 14 && dte < 21)  return 0.75
  if (dte > 45 && dte <= 60)  return 0.65
  if (dte > 60 && dte <= 90)  return 0.4
  return 0.2
}

function scoreIVPremium(ratio: number, preferHigh: boolean): number {
  if (preferHigh) return Math.min(Math.max(0, (ratio - 0.8) / 1.2), 1)
  return Math.max(0, 1 - ratio)
}

function scorePremiumYield(annYield: number): number {
  // 20%+ annualised is excellent, 10% is decent
  return Math.min(annYield / 40, 1)
}

function scorePoP(pop: number): number {
  return pop / 100
}

function compositeScore(components: {
  ivr: number; dte: number; ivPrem: number; yield: number; pop: number
}, weights: { ivr: number; dte: number; ivPrem: number; yield: number; pop: number }): number {
  const raw = (
    components.ivr   * weights.ivr   +
    components.dte   * weights.dte   +
    components.ivPrem * weights.ivPrem +
    components.yield * weights.yield +
    components.pop   * weights.pop
  )
  return Math.min(99, Math.round(raw * 100))
}

// ── Strategy builders ──────────────────────────────────────────────────

export function buildIronCondor(
  ticker: string, calls: OptionContract[], puts: OptionContract[],
  spot: number, iv30: number, ivRank: number, ivHvRatio: number
): ScoredStrategy | null {
  // Target ~16Δ short strikes (1-SD OTM), ~5Δ long strikes (1.5-SD OTM)
  const target16CallStrike = spot * (1 + (iv30/100) * Math.sqrt(30/365))
  const target16PutStrike  = spot * (1 - (iv30/100) * Math.sqrt(30/365))

  const shortCall = calls.find(c => c.details.strike_price >= target16CallStrike * 0.98) ?? calls[calls.length - 1]
  const shortPut  = puts.filter(c => c.details.strike_price <= target16PutStrike * 1.02).pop() ?? puts[0]
  const longCall  = calls.find(c => c.details.strike_price > (shortCall?.details.strike_price ?? 0) * 1.04)
  const longPut   = puts.filter(c => c.details.strike_price < (shortPut?.details.strike_price ?? 0) * 0.96).pop()

  if (!shortCall || !shortPut || !longCall || !longPut) return null

  const scPrice = contractPrice(shortCall)
  const spPrice = contractPrice(shortPut)
  const lcPrice = contractPrice(longCall)
  const lpPrice = contractPrice(longPut)

  if (!scPrice || !spPrice) return null

  const credit   = scPrice + spPrice - (lcPrice + lpPrice)
  const wingWidth = Math.max(
    longCall.details.strike_price - shortCall.details.strike_price,
    shortPut.details.strike_price - longPut.details.strike_price
  )
  const maxLoss  = wingWidth - credit
  if (maxLoss <= 0 || credit <= 0) return null

  const dte        = daysToExpiry(shortCall.details.expiration_date)
  const annYield   = (credit / maxLoss) * (365 / dte) * 100
  const pop        = 68  // ~1-SD short strikes ≈ 68% inside
  const expMove    = spot * (iv30/100) * Math.sqrt(dte/365)

  const score = compositeScore({
    ivr:    scoreIVR(ivRank, true),
    dte:    scoreDTE(dte),
    ivPrem: scoreIVPremium(ivHvRatio, true),
    yield:  scorePremiumYield(annYield),
    pop:    scorePoP(pop),
  }, { ivr: 0.25, dte: 0.15, ivPrem: 0.25, yield: 0.25, pop: 0.10 })

  return {
    id: `${ticker}-IC-${shortCall.details.expiration_date}`,
    ticker, type: 'Iron Condor', thesis: 'Sell Premium',
    legs: [
      { contract: shortCall, action: 'SELL', price: scPrice },
      { contract: longCall,  action: 'BUY',  price: lcPrice },
      { contract: shortPut,  action: 'SELL', price: spPrice },
      { contract: longPut,   action: 'BUY',  price: lpPrice },
    ],
    score, pop, premiumYield: annYield, maxProfit: credit, maxLoss,
    breakevens: [
      shortCall.details.strike_price + credit,
      shortPut.details.strike_price - credit,
    ],
    dte, ivRank, ivHvRatio, expectedMove: expMove, expectedMovePct: (expMove/spot)*100,
    edge: `IV ${ivHvRatio.toFixed(2)}× HV — selling rich vol. ${pop}% chance stock stays inside $${shortPut.details.strike_price}–$${shortCall.details.strike_price}.`,
  }
}

export function buildBullPutSpread(
  ticker: string, puts: OptionContract[],
  spot: number, iv30: number, ivRank: number, ivHvRatio: number
): ScoredStrategy | null {
  // Short ~30Δ put, long ~16Δ put (OTM spread)
  const shortPutTarget = spot * (1 - 0.03)  // ~3% OTM short leg
  const shortPut = puts.filter(c => c.details.strike_price <= shortPutTarget * 1.01).pop()
  const longPut  = puts.filter(c => c.details.strike_price <= (shortPut?.details.strike_price ?? 0) * 0.97).pop()

  if (!shortPut || !longPut) return null

  const spPrice = contractPrice(shortPut)
  const lpPrice = contractPrice(longPut)
  if (!spPrice) return null

  const credit   = spPrice - lpPrice
  const width    = shortPut.details.strike_price - longPut.details.strike_price
  const maxLoss  = width - credit
  if (maxLoss <= 0 || credit <= 0) return null

  const dte      = daysToExpiry(shortPut.details.expiration_date)
  const annYield = (credit / maxLoss) * (365 / dte) * 100
  const deltaAbs = Math.abs(shortPut.greeks?.delta ?? 0.30)
  const pop      = Math.round((1 - deltaAbs) * 100)
  const expMove  = spot * (iv30/100) * Math.sqrt(dte/365)

  const score = compositeScore({
    ivr:    scoreIVR(ivRank, true),
    dte:    scoreDTE(dte),
    ivPrem: scoreIVPremium(ivHvRatio, true),
    yield:  scorePremiumYield(annYield),
    pop:    scorePoP(pop),
  }, { ivr: 0.25, dte: 0.15, ivPrem: 0.20, yield: 0.25, pop: 0.15 })

  return {
    id: `${ticker}-BPS-${shortPut.details.expiration_date}`,
    ticker, type: 'Bull Put Spread', thesis: 'Bullish',
    legs: [
      { contract: shortPut, action: 'SELL', price: spPrice },
      { contract: longPut,  action: 'BUY',  price: lpPrice },
    ],
    score, pop, premiumYield: annYield, maxProfit: credit, maxLoss,
    breakevens: [shortPut.details.strike_price - credit],
    dte, ivRank, ivHvRatio, expectedMove: expMove, expectedMovePct: (expMove/spot)*100,
    edge: `Collect $${credit.toFixed(2)} credit. ${pop}% PoP. Stock must stay above $${(shortPut.details.strike_price - credit).toFixed(2)} at expiry.`,
  }
}

export function buildBearCallSpread(
  ticker: string, calls: OptionContract[],
  spot: number, iv30: number, ivRank: number, ivHvRatio: number
): ScoredStrategy | null {
  const shortCallTarget = spot * 1.03
  const shortCall = calls.find(c => c.details.strike_price >= shortCallTarget * 0.99)
  const longCall  = calls.find(c => c.details.strike_price >= (shortCall?.details.strike_price ?? 0) * 1.03)

  if (!shortCall || !longCall) return null

  const scPrice = contractPrice(shortCall)
  const lcPrice = contractPrice(longCall)
  if (!scPrice) return null

  const credit  = scPrice - lcPrice
  const width   = longCall.details.strike_price - shortCall.details.strike_price
  const maxLoss = width - credit
  if (maxLoss <= 0 || credit <= 0) return null

  const dte      = daysToExpiry(shortCall.details.expiration_date)
  const annYield = (credit / maxLoss) * (365 / dte) * 100
  const deltaAbs = Math.abs(shortCall.greeks?.delta ?? 0.30)
  const pop      = Math.round((1 - deltaAbs) * 100)
  const expMove  = spot * (iv30/100) * Math.sqrt(dte/365)

  const score = compositeScore({
    ivr:    scoreIVR(ivRank, true),
    dte:    scoreDTE(dte),
    ivPrem: scoreIVPremium(ivHvRatio, true),
    yield:  scorePremiumYield(annYield),
    pop:    scorePoP(pop),
  }, { ivr: 0.25, dte: 0.15, ivPrem: 0.20, yield: 0.25, pop: 0.15 })

  return {
    id: `${ticker}-BCS-${shortCall.details.expiration_date}`,
    ticker, type: 'Bear Call Spread', thesis: 'Bearish',
    legs: [
      { contract: shortCall, action: 'SELL', price: scPrice },
      { contract: longCall,  action: 'BUY',  price: lcPrice },
    ],
    score, pop, premiumYield: annYield, maxProfit: credit, maxLoss,
    breakevens: [shortCall.details.strike_price + credit],
    dte, ivRank, ivHvRatio, expectedMove: expMove, expectedMovePct: (expMove/spot)*100,
    edge: `Collect $${credit.toFixed(2)} credit. ${pop}% PoP. Stock must stay below $${(shortCall.details.strike_price + credit).toFixed(2)} at expiry.`,
  }
}

export function buildCashSecuredPut(
  ticker: string, puts: OptionContract[],
  spot: number, iv30: number, ivRank: number, ivHvRatio: number
): ScoredStrategy | null {
  // 30Δ put — income play, willing to buy stock at strike
  const target = spot * 0.97
  const put = puts.filter(c => c.details.strike_price <= target * 1.01).pop()
  if (!put) return null

  const price = contractPrice(put)
  if (!price) return null

  const dte       = daysToExpiry(put.details.expiration_date)
  const annYield  = (price / put.details.strike_price) * (365 / dte) * 100
  const deltaAbs  = Math.abs(put.greeks?.delta ?? 0.30)
  const pop       = Math.round((1 - deltaAbs) * 100)
  const expMove   = spot * (iv30/100) * Math.sqrt(dte/365)

  const score = compositeScore({
    ivr:    scoreIVR(ivRank, true),
    dte:    scoreDTE(dte),
    ivPrem: scoreIVPremium(ivHvRatio, true),
    yield:  scorePremiumYield(annYield),
    pop:    scorePoP(pop),
  }, { ivr: 0.30, dte: 0.10, ivPrem: 0.20, yield: 0.25, pop: 0.15 })

  return {
    id: `${ticker}-CSP-${put.details.expiration_date}`,
    ticker, type: 'Cash-Secured Put', thesis: 'Bullish',
    legs: [{ contract: put, action: 'SELL', price }],
    score, pop, premiumYield: annYield, maxProfit: price,
    maxLoss: put.details.strike_price - price,
    breakevens: [put.details.strike_price - price],
    dte, ivRank, ivHvRatio, expectedMove: expMove, expectedMovePct: (expMove/spot)*100,
    edge: `${annYield.toFixed(1)}% annualised yield. Buy ${ticker} at $${(put.details.strike_price - price).toFixed(2)} effective cost if assigned.`,
  }
}

export function buildCoveredCall(
  ticker: string, calls: OptionContract[],
  spot: number, iv30: number, ivRank: number, ivHvRatio: number
): ScoredStrategy | null {
  // 20-30Δ call — enhance yield on long stock
  const target = spot * 1.03
  const call = calls.find(c => c.details.strike_price >= target * 0.99)
  if (!call) return null

  const price = contractPrice(call)
  if (!price) return null

  const dte      = daysToExpiry(call.details.expiration_date)
  const annYield = (price / spot) * (365 / dte) * 100
  const deltaAbs = call.greeks?.delta ?? 0.25
  const pop      = Math.round((1 - deltaAbs) * 100)
  const expMove  = spot * (iv30/100) * Math.sqrt(dte/365)

  const score = compositeScore({
    ivr:    scoreIVR(ivRank, true),
    dte:    scoreDTE(dte),
    ivPrem: scoreIVPremium(ivHvRatio, true),
    yield:  scorePremiumYield(annYield),
    pop:    scorePoP(pop),
  }, { ivr: 0.25, dte: 0.10, ivPrem: 0.20, yield: 0.30, pop: 0.15 })

  return {
    id: `${ticker}-CC-${call.details.expiration_date}`,
    ticker, type: 'Covered Call', thesis: 'Neutral',
    legs: [{ contract: call, action: 'SELL', price }],
    score, pop, premiumYield: annYield, maxProfit: price,
    maxLoss: Infinity,
    breakevens: [spot - price],
    dte, ivRank, ivHvRatio, expectedMove: expMove, expectedMovePct: (expMove/spot)*100,
    edge: `${annYield.toFixed(1)}% annualised yield. Cap upside at $${call.details.strike_price}. Keep premium if stock stays below strike.`,
  }
}

export function buildLongStraddle(
  ticker: string, calls: OptionContract[], puts: OptionContract[],
  spot: number, iv30: number, ivRank: number, ivHvRatio: number
): ScoredStrategy | null {
  if (ivRank > 40) return null  // only build when vol is cheap

  const atmCall = calls.reduce((best, c) =>
    Math.abs(c.details.strike_price - spot) < Math.abs(best.details.strike_price - spot) ? c : best, calls[0])
  const atmPut = puts.reduce((best, c) =>
    Math.abs(c.details.strike_price - spot) < Math.abs(best.details.strike_price - spot) ? c : best, puts[0])

  if (!atmCall || !atmPut) return null

  const callPrice = contractPrice(atmCall)
  const putPrice  = contractPrice(atmPut)
  if (!callPrice || !putPrice) return null

  const cost     = callPrice + putPrice
  const dte      = daysToExpiry(atmCall.details.expiration_date)
  const expMove  = spot * (iv30/100) * Math.sqrt(dte/365)
  // PoP for straddle: need move > cost in either direction
  const breakeven = cost / spot * 100
  const pop       = Math.round(Math.max(20, 50 - breakeven * 2))

  const score = compositeScore({
    ivr:    scoreIVR(ivRank, false),      // want LOW ivr
    dte:    scoreDTE(dte),
    ivPrem: scoreIVPremium(ivHvRatio, false), // want IV < HV
    yield:  Math.min(expMove / (cost * 2), 1),
    pop:    scorePoP(pop),
  }, { ivr: 0.30, dte: 0.15, ivPrem: 0.25, yield: 0.15, pop: 0.15 })

  return {
    id: `${ticker}-LS-${atmCall.details.expiration_date}`,
    ticker, type: 'Long Straddle', thesis: 'Buy Vol',
    legs: [
      { contract: atmCall, action: 'BUY', price: callPrice },
      { contract: atmPut,  action: 'BUY', price: putPrice  },
    ],
    score, pop, premiumYield: 0, maxProfit: Infinity, maxLoss: cost,
    breakevens: [
      atmCall.details.strike_price + cost,
      atmCall.details.strike_price - cost,
    ],
    dte, ivRank, ivHvRatio, expectedMove: expMove, expectedMovePct: (expMove/spot)*100,
    edge: `Vol historically cheap (IVR ${ivRank}). Need ${breakeven.toFixed(1)}% move to profit. Expected 1-SD move: ${((expMove/spot)*100).toFixed(1)}%.`,
  }
}

export function buildAllStrategies(
  ticker: string,
  contracts: OptionContract[],
  spot: number,
  iv30: number,
  ivRank: number,
  ivHvRatio: number,
  targetDTE = 30
): ScoredStrategy[] {
  if (!contracts.length || spot <= 0) return []

  // Pick the expiry closest to targetDTE
  const expiries = [...new Set(contracts.map(c => c.details.expiration_date))].sort()
  const bestExpiry = expiries
    .filter(e => daysToExpiry(e) >= 7)
    .reduce((best, e) => {
      const dBest = Math.abs(daysToExpiry(best) - targetDTE)
      const dThis = Math.abs(daysToExpiry(e) - targetDTE)
      return dThis < dBest ? e : best
    }, expiries[0] ?? '')

  if (!bestExpiry) return []

  const calls = contracts.filter(c => c.details.expiration_date === bestExpiry && c.details.contract_type === 'call')
    .sort((a, b) => a.details.strike_price - b.details.strike_price)
  const puts = contracts.filter(c => c.details.expiration_date === bestExpiry && c.details.contract_type === 'put')
    .sort((a, b) => a.details.strike_price - b.details.strike_price)

  if (!calls.length || !puts.length) return []

  const strategies: ScoredStrategy[] = []

  const ic  = buildIronCondor(ticker, calls, puts, spot, iv30, ivRank, ivHvRatio)
  const bps = buildBullPutSpread(ticker, puts, spot, iv30, ivRank, ivHvRatio)
  const bcs = buildBearCallSpread(ticker, calls, spot, iv30, ivRank, ivHvRatio)
  const csp = buildCashSecuredPut(ticker, puts, spot, iv30, ivRank, ivHvRatio)
  const cc  = buildCoveredCall(ticker, calls, spot, iv30, ivRank, ivHvRatio)
  const ls  = buildLongStraddle(ticker, calls, puts, spot, iv30, ivRank, ivHvRatio)

  if (ic)  strategies.push(ic)
  if (bps) strategies.push(bps)
  if (bcs) strategies.push(bcs)
  if (csp) strategies.push(csp)
  if (cc)  strategies.push(cc)
  if (ls)  strategies.push(ls)

  return strategies.sort((a, b) => b.score - a.score)
}
