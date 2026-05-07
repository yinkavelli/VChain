import type { OptionContract } from './massiveApi'

export type StrategyType =
  | 'Covered Call'
  | 'Cash-Secured Put'
  | 'Bull Call Spread'
  | 'Bear Put Spread'
  | 'Long Straddle'
  | 'Iron Condor'

export type Sentiment = 'Bullish' | 'Bearish' | 'Neutral'

export interface StrategyLeg {
  symbol: string
  type: 'call' | 'put'
  strike: number
  expiry: string
  bid: number
  ask: number
  last: number
  iv: number
  delta: number
}

export interface Strategy {
  id: string
  ticker: string
  type: StrategyType
  sentiment: Sentiment
  score: number
  probabilityOfProfit: number
  maxProfit: number
  maxLoss: number
  breakeven: number[]
  legs: StrategyLeg[]
  daysToExpiry: number
  ivRank: number
  expiry: string
}

function daysUntil(dateStr: string): number {
  return Math.max(0, Math.round((new Date(dateStr).getTime() - Date.now()) / 86_400_000))
}

function mid(c: OptionContract): number {
  const b = c.last_quote?.bid ?? 0
  const a = c.last_quote?.ask ?? 0
  if (b > 0 && a > 0) return (b + a) / 2
  return c.last_trade?.price ?? 0
}

function toLeg(c: OptionContract): StrategyLeg {
  return {
    symbol:  c.ticker,
    type:    c.details.contract_type,
    strike:  c.details.strike_price,
    expiry:  c.details.expiration_date,
    bid:     c.last_quote?.bid ?? 0,
    ask:     c.last_quote?.ask ?? 0,
    last:    c.last_trade?.price ?? 0,
    iv:      (c.implied_volatility ?? 0) * 100,
    delta:   c.greeks?.delta ?? 0,
  }
}

function uid(ticker: string, type: string, expiry: string) {
  return `${ticker}-${type.replace(/\s/g, '-')}-${expiry}`
}

export function buildStrategies(
  ticker: string,
  contracts: OptionContract[],
  spotPrice: number,
  ivRank: number
): Strategy[] {
  if (!contracts.length || spotPrice <= 0) return []

  const strategies: Strategy[] = []
  const byExpiry = new Map<string, OptionContract[]>()
  for (const c of contracts) {
    const exp = c.details.expiration_date
    if (!byExpiry.has(exp)) byExpiry.set(exp, [])
    byExpiry.get(exp)!.push(c)
  }

  for (const [expiry, exContracts] of byExpiry) {
    const dte = daysUntil(expiry)
    if (dte < 7 || dte > 60) continue

    const calls = exContracts.filter(c => c.details.contract_type === 'call')
      .sort((a, b) => a.details.strike_price - b.details.strike_price)
    const puts = exContracts.filter(c => c.details.contract_type === 'put')
      .sort((a, b) => a.details.strike_price - b.details.strike_price)

    const atmCall = calls.reduce((best, c) =>
      Math.abs(c.details.strike_price - spotPrice) < Math.abs(best.details.strike_price - spotPrice) ? c : best, calls[0])
    const atmPut = puts.reduce((best, c) =>
      Math.abs(c.details.strike_price - spotPrice) < Math.abs(best.details.strike_price - spotPrice) ? c : best, puts[0])

    if (!atmCall || !atmPut) continue

    const dteMod = dte >= 21 && dte <= 45
      ? 1
      : dte >= 14 && dte < 21 ? 0.8
      : dte > 45 && dte <= 60 ? 0.7 : 0.5

    function score(pop: number, rr: number): number {
      const popMod = pop / 100
      const rrMod  = Math.min(rr, 3) / 3
      return Math.min(99, Math.round((popMod * 0.5 + rrMod * 0.3 + dteMod * 0.2) * 100))
    }

    // 1. Covered Call — sell 5% OTM call
    const ccStrike = spotPrice * 1.05
    const ccCall   = calls.find(c => c.details.strike_price >= ccStrike) ?? calls[calls.length - 1]
    if (ccCall) {
      const premium = mid(ccCall)
      const pop = (1 - Math.abs(ccCall.greeks?.delta ?? 0.3)) * 100
      strategies.push({
        id: uid(ticker, 'Covered Call', expiry),
        ticker, type: 'Covered Call', sentiment: 'Bullish',
        legs: [toLeg(ccCall)],
        daysToExpiry: dte, ivRank, expiry,
        probabilityOfProfit: pop,
        maxProfit: premium,
        maxLoss: Infinity,
        breakeven: [spotPrice - premium],
        score: score(pop, premium / (spotPrice - premium)),
      })
    }

    // 2. Cash-Secured Put — sell 5% OTM put
    const cspStrike = spotPrice * 0.95
    const cspPut    = puts.filter(c => c.details.strike_price <= cspStrike).pop() ?? puts[0]
    if (cspPut) {
      const premium = mid(cspPut)
      const pop = (1 - Math.abs(cspPut.greeks?.delta ?? 0.3)) * 100
      strategies.push({
        id: uid(ticker, 'Cash-Secured Put', expiry),
        ticker, type: 'Cash-Secured Put', sentiment: 'Bullish',
        legs: [toLeg(cspPut)],
        daysToExpiry: dte, ivRank, expiry,
        probabilityOfProfit: pop,
        maxProfit: premium,
        maxLoss: cspPut.details.strike_price - premium,
        breakeven: [cspPut.details.strike_price - premium],
        score: score(pop, premium / (cspPut.details.strike_price - premium)),
      })
    }

    // 3. Bull Call Spread
    const bcsLong  = atmCall
    const bcsShort = calls.find(c => c.details.strike_price >= spotPrice * 1.06)
    if (bcsShort) {
      const debit = mid(bcsLong) - mid(bcsShort)
      const width = bcsShort.details.strike_price - bcsLong.details.strike_price
      const pop   = (atmCall.greeks?.delta ?? 0.5) * 100
      strategies.push({
        id: uid(ticker, 'Bull Call Spread', expiry),
        ticker, type: 'Bull Call Spread', sentiment: 'Bullish',
        legs: [toLeg(bcsLong), toLeg(bcsShort)],
        daysToExpiry: dte, ivRank, expiry,
        probabilityOfProfit: pop,
        maxProfit: width - debit,
        maxLoss: debit,
        breakeven: [bcsLong.details.strike_price + debit],
        score: score(pop, (width - debit) / debit),
      })
    }

    // 4. Bear Put Spread
    const bpsLong  = atmPut
    const bpsShort = puts.find(c => c.details.strike_price <= spotPrice * 0.94)
    if (bpsShort) {
      const debit = mid(bpsLong) - mid(bpsShort)
      const width = bpsLong.details.strike_price - bpsShort.details.strike_price
      const pop   = (1 - Math.abs(atmPut.greeks?.delta ?? 0.5)) * 100
      strategies.push({
        id: uid(ticker, 'Bear Put Spread', expiry),
        ticker, type: 'Bear Put Spread', sentiment: 'Bearish',
        legs: [toLeg(bpsLong), toLeg(bpsShort)],
        daysToExpiry: dte, ivRank, expiry,
        probabilityOfProfit: pop,
        maxProfit: width - debit,
        maxLoss: debit,
        breakeven: [bpsLong.details.strike_price - debit],
        score: score(pop, (width - debit) / debit),
      })
    }

    // 5. Long Straddle
    const straddleCost = mid(atmCall) + mid(atmPut)
    const straddlePop  = 35
    strategies.push({
      id: uid(ticker, 'Long Straddle', expiry),
      ticker, type: 'Long Straddle', sentiment: 'Neutral',
      legs: [toLeg(atmCall), toLeg(atmPut)],
      daysToExpiry: dte, ivRank, expiry,
      probabilityOfProfit: straddlePop,
      maxProfit: Infinity,
      maxLoss: straddleCost,
      breakeven: [atmCall.details.strike_price + straddleCost, atmCall.details.strike_price - straddleCost],
      score: score(straddlePop, 2),
    })

    // 6. Iron Condor
    const icShortCall = calls.find(c => c.details.strike_price >= spotPrice * 1.07)
    const icLongCall  = calls.find(c => c.details.strike_price >= spotPrice * 1.12)
    const icShortPut  = puts.filter(c => c.details.strike_price <= spotPrice * 0.93).pop()
    const icLongPut   = puts.filter(c => c.details.strike_price <= spotPrice * 0.88).pop()
    if (icShortCall && icLongCall && icShortPut && icLongPut) {
      const credit  = mid(icShortCall) + mid(icShortPut) - mid(icLongCall) - mid(icLongPut)
      const wingW   = icLongCall.details.strike_price - icShortCall.details.strike_price
      const maxLoss = wingW - credit
      const pop     = 65
      strategies.push({
        id: uid(ticker, 'Iron Condor', expiry),
        ticker, type: 'Iron Condor', sentiment: 'Neutral',
        legs: [toLeg(icShortCall), toLeg(icLongCall), toLeg(icShortPut), toLeg(icLongPut)],
        daysToExpiry: dte, ivRank, expiry,
        probabilityOfProfit: pop,
        maxProfit: credit,
        maxLoss,
        breakeven: [icShortCall.details.strike_price + credit, icShortPut.details.strike_price - credit],
        score: score(pop, credit / maxLoss),
      })
    }
  }

  return strategies.sort((a, b) => b.score - a.score)
}
