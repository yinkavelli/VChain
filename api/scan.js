// Shared strategy scan endpoint
// Called by: Vercel cron (/api/cron/strategy-scan) AND manual Rescan button
// Fetches option chains, builds strategies, stores to Supabase strategy_scans

import { createClient } from '@supabase/supabase-js'

const MASSIVE_KEY = process.env.MASSIVE_API_KEY
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY

const SCAN_UNIVERSE = [
  'AAPL','MSFT','NVDA','AMZN','META','TSLA','JPM','AMD','NFLX','SPY',
  'GOOGL','V','MA','BAC','XOM','QQQ','AVGO','CRM','PANW','IWM',
]

// ── Market hours check ────────────────────────────────────────────────
function isMarketOpen() {
  const now = new Date()
  const day = now.getUTCDay()  // 0=Sun 6=Sat
  if (day === 0 || day === 6) return false

  // ET offset: UTC-4 (EDT Mar-Nov) or UTC-5 (EST Nov-Mar)
  const month = now.getUTCMonth() + 1
  const isEDT = month >= 3 && month <= 11
  const etHour = now.getUTCHours() - (isEDT ? 4 : 5)
  const etMin  = now.getUTCMinutes()
  const etMins = etHour * 60 + etMin

  return etMins >= 9 * 60 + 30 && etMins < 16 * 60  // 9:30am–4:00pm ET
}

// ── Fetch option chain from Massive ──────────────────────────────────
async function fetchChain(ticker, from, to) {
  const params = new URLSearchParams({
    'expiration_date.gte': from,
    'expiration_date.lte': to,
    limit: '120',
  })
  const res = await fetch(
    `https://api.massive.com/v3/snapshot/options/${ticker}?${params}`,
    { headers: { Authorization: `Bearer ${MASSIVE_KEY}` } }
  )
  if (!res.ok) return []
  const data = await res.json()
  const results = data.results ?? []
  // paginate if needed
  if (data.next_url && results.length >= 120) {
    try {
      const r2 = await fetch(data.next_url.replace('https://api.massive.com','') , { headers: { Authorization: `Bearer ${MASSIVE_KEY}` } })
      const d2 = await r2.json()
      results.push(...(d2.results ?? []))
    } catch {}
  }
  return results
}

// ── Compute IV30 from ATM contracts ───────────────────────────────────
function computeIV30(contracts, spot) {
  const now = Date.now()
  const atm = contracts
    .filter(c => {
      const dte = Math.round((new Date(c.details.expiration_date + 'T20:00:00Z').getTime() - now) / 86_400_000)
      const pct = Math.abs(c.details.strike_price - spot) / spot
      return dte >= 10 && dte <= 45 && pct < 0.05 && (c.implied_volatility ?? 0) > 0
    })
    .sort((a, b) => Math.abs(a.details.strike_price - spot) - Math.abs(b.details.strike_price - spot))
    .slice(0, 8)
  if (!atm.length) return 0
  return +(atm.reduce((s, c) => s + (c.implied_volatility ?? 0), 0) / atm.length * 100).toFixed(1)
}

// ── Strategy builder ──────────────────────────────────────────────────
function contractPrice(c) {
  return c.day?.close || c.day?.vwap || c.prevDay?.close || c.prevDay?.vwap || c.last_quote?.ask || 0
}

function daysToExpiry(expiry) {
  return Math.max(0, Math.round(
    (new Date(expiry + 'T20:00:00Z').getTime() - Date.now()) / 86_400_000
  ))
}

function popFromDelta(delta) {
  return Math.round((1 - Math.abs(delta ?? 0.30)) * 100)
}

function nearestWidth(strikes, target) {
  if (strikes.length < 2) return target
  const incs = strikes.slice(1).map((s, i) => s - strikes[i]).filter(i => i > 0)
  const min = Math.min(...incs)
  return Math.max(min, Math.round(target / min) * min)
}

function scoreComposite(ivr, d, ratio, yld, pop, w) {
  w = w || { ivr: 0.25, dte: 0.15, ratio: 0.25, yld: 0.25, pop: 0.10 }
  const scoreDTE = d >= 21 && d <= 45 ? 1.0 : d >= 14 ? 0.75 : d <= 60 ? 0.65 : 0.3
  return Math.min(99, Math.round(
    (ivr * w.ivr + scoreDTE * w.dte + ratio * w.ratio + Math.min(yld/40,1) * w.yld + (pop/100) * w.pop) * 100
  ))
}

function buildIronCondor(ticker, calls, puts, spot, iv30, ivRank, ivHvRatio) {
  const sc = [...calls].sort((a,b) => a.details.strike_price - b.details.strike_price)
  const sp = [...puts].sort((a,b)  => a.details.strike_price - b.details.strike_price)
  const atmIdx = sc.findIndex(c => c.details.strike_price >= spot)
  if (atmIdx < 0 || atmIdx >= sc.length - 2) return null

  const target = spot * (1 + (iv30/100) * Math.sqrt(30/365))
  let scIdx = sc.findIndex(c => c.details.strike_price >= target)
  if (scIdx < 0) scIdx = sc.length - 2
  scIdx = Math.max(atmIdx + 2, scIdx)
  if (scIdx >= sc.length - 1) return null

  const shortCall  = sc[scIdx]
  const shortCallK = shortCall.details.strike_price
  const wingWidth  = Math.max(nearestWidth(sc.map(c => c.details.strike_price), (shortCallK - spot) * 0.4), 5)
  const longCall   = sc.find(c => c.details.strike_price >= shortCallK + wingWidth * 0.999)
  if (!longCall) return null

  const callOTM      = (shortCallK - spot) / spot
  const targetPutK   = spot * (1 - callOTM)
  const shortPut     = [...sp].reverse().find(p => p.details.strike_price <= targetPutK * 1.001)
  if (!shortPut) return null
  const shortPutK    = shortPut.details.strike_price
  const longPut      = [...sp].reverse().find(p => p.details.strike_price <= shortPutK - wingWidth * 0.95)
  if (!longPut) return null

  const callWing = longCall.details.strike_price - shortCallK
  const putWing  = shortPutK - longPut.details.strike_price
  if (Math.abs(callWing - putWing) / Math.max(callWing, putWing) > 0.25) return null

  const scP = contractPrice(shortCall), spP = contractPrice(shortPut)
  const lcP = contractPrice(longCall),  lpP = contractPrice(longPut)
  if (!scP || !spP) return null

  const credit  = scP + spP - (lcP + lpP)
  const width   = Math.min(callWing, putWing)
  const maxLoss = width - credit
  if (credit <= 0 || maxLoss <= 0) return null

  const days     = daysToExpiry(shortCall.details.expiration_date)
  const annYield = (credit / maxLoss) * (365 / Math.max(days,1)) * 100
  const pop      = Math.round((popFromDelta(shortCall.greeks?.delta) + popFromDelta(shortPut.greeks?.delta)) / 2)
  const expMove  = spot * (iv30/100) * Math.sqrt(days/365)
  const ivrScore = Math.min(ivRank/100, 1)
  const ratioScore = Math.min(Math.max(0, (ivHvRatio - 0.8)/1.2), 1)

  return {
    id: `${ticker}-IC-${shortCall.details.expiration_date}`,
    ticker, type: 'Iron Condor', thesis: 'Sell Premium',
    legs: [
      { symbol: shortCall.ticker, action: 'SELL', strike: shortCallK, type: 'CALL', expiry: shortCall.details.expiration_date, price: scP },
      { symbol: longCall.ticker,  action: 'BUY',  strike: longCall.details.strike_price, type: 'CALL', expiry: longCall.details.expiration_date, price: lcP },
      { symbol: shortPut.ticker,  action: 'SELL', strike: shortPutK, type: 'PUT',  expiry: shortPut.details.expiration_date, price: spP },
      { symbol: longPut.ticker,   action: 'BUY',  strike: longPut.details.strike_price, type: 'PUT',  expiry: longPut.details.expiration_date, price: lpP },
    ],
    score: scoreComposite(ivrScore, days, ratioScore, annYield, pop),
    pop, premiumYield: +annYield.toFixed(1), maxProfit: +credit.toFixed(2), maxLoss: +maxLoss.toFixed(2),
    breakevens: [+(shortCallK + credit).toFixed(2), +(shortPutK - credit).toFixed(2)],
    dte: days, ivRank, ivHvRatio, expectedMove: +expMove.toFixed(2), expectedMovePct: +((expMove/spot)*100).toFixed(1),
    edge: `Collect $${credit.toFixed(2)} credit. ${pop}% PoP. Range $${shortPutK}–$${shortCallK}. Wings $${putWing}/$${callWing}.`,
  }
}

function buildBullPutSpread(ticker, puts, spot, iv30, ivRank, ivHvRatio) {
  const sp = [...puts].sort((a,b) => a.details.strike_price - b.details.strike_price)
  const targetK  = spot * (1 - Math.max(0.03, (iv30/100) * Math.sqrt(21/365)))
  const shortPut = [...sp].reverse().find(p => p.details.strike_price <= targetK * 1.005)
  if (!shortPut) return null
  const shortK   = shortPut.details.strike_price
  const wingW    = Math.max(nearestWidth(sp.map(p => p.details.strike_price), spot * 0.015), 5)
  const longPut  = [...sp].reverse().find(p => p.details.strike_price <= shortK - wingW * 0.95)
  if (!longPut) return null
  const spP = contractPrice(shortPut), lpP = contractPrice(longPut)
  if (!spP) return null
  const credit = spP - lpP, width = shortK - longPut.details.strike_price, maxLoss = width - credit
  if (credit <= 0 || maxLoss <= 0) return null
  const days = daysToExpiry(shortPut.details.expiration_date)
  const annYield = (credit / maxLoss) * (365 / Math.max(days,1)) * 100
  const pop = popFromDelta(shortPut.greeks?.delta)
  const expMove = spot * (iv30/100) * Math.sqrt(days/365)
  return {
    id: `${ticker}-BPS-${shortPut.details.expiration_date}`,
    ticker, type: 'Bull Put Spread', thesis: 'Bullish',
    legs: [
      { symbol: shortPut.ticker, action: 'SELL', strike: shortK, type: 'PUT', expiry: shortPut.details.expiration_date, price: spP },
      { symbol: longPut.ticker,  action: 'BUY',  strike: longPut.details.strike_price, type: 'PUT', expiry: longPut.details.expiration_date, price: lpP },
    ],
    score: scoreComposite(Math.min(ivRank/100,1), days, Math.min(Math.max(0,(ivHvRatio-0.8)/1.2),1), annYield, pop, { ivr:0.25,dte:0.15,ratio:0.20,yld:0.25,pop:0.15 }),
    pop, premiumYield: +annYield.toFixed(1), maxProfit: +credit.toFixed(2), maxLoss: +maxLoss.toFixed(2),
    breakevens: [+(shortK - credit).toFixed(2)],
    dte: days, ivRank, ivHvRatio, expectedMove: +expMove.toFixed(2), expectedMovePct: +((expMove/spot)*100).toFixed(1),
    edge: `$${credit.toFixed(2)} credit on $${width} spread. ${pop}% PoP. BE $${(shortK-credit).toFixed(2)}.`,
  }
}

function buildCashSecuredPut(ticker, puts, spot, iv30, ivRank, ivHvRatio) {
  const sp = [...puts].sort((a,b) => a.details.strike_price - b.details.strike_price)
  const targetK = spot * (1 - Math.max(0.03, (iv30/100) * Math.sqrt(21/365)))
  const put = [...sp].reverse().find(p => p.details.strike_price <= targetK * 1.005)
  if (!put) return null
  const p = contractPrice(put)
  if (!p) return null
  const days = daysToExpiry(put.details.expiration_date)
  const annYield = (p / put.details.strike_price) * (365 / Math.max(days,1)) * 100
  const pop = popFromDelta(put.greeks?.delta)
  const expMove = spot * (iv30/100) * Math.sqrt(days/365)
  return {
    id: `${ticker}-CSP-${put.details.expiration_date}`,
    ticker, type: 'Cash-Secured Put', thesis: 'Bullish',
    legs: [{ symbol: put.ticker, action: 'SELL', strike: put.details.strike_price, type: 'PUT', expiry: put.details.expiration_date, price: p }],
    score: scoreComposite(Math.min(ivRank/100,1), days, Math.min(Math.max(0,(ivHvRatio-0.8)/1.2),1), annYield, pop, { ivr:0.30,dte:0.10,ratio:0.20,yld:0.25,pop:0.15 }),
    pop, premiumYield: +annYield.toFixed(1), maxProfit: +p.toFixed(2), maxLoss: +(put.details.strike_price - p).toFixed(2),
    breakevens: [+(put.details.strike_price - p).toFixed(2)],
    dte: days, ivRank, ivHvRatio, expectedMove: +expMove.toFixed(2), expectedMovePct: +((expMove/spot)*100).toFixed(1),
    edge: `${annYield.toFixed(1)}% ann. yield. BE $${(put.details.strike_price-p).toFixed(2)}. ${pop}% PoP.`,
  }
}

function buildBearCallSpread(ticker, calls, spot, iv30, ivRank, ivHvRatio) {
  const sc = [...calls].sort((a,b) => a.details.strike_price - b.details.strike_price)
  const targetK   = spot * (1 + Math.max(0.03, (iv30/100) * Math.sqrt(21/365)))
  const shortCall = sc.find(c => c.details.strike_price >= targetK * 0.995)
  if (!shortCall) return null
  const shortK  = shortCall.details.strike_price
  const wingW   = Math.max(nearestWidth(sc.map(c => c.details.strike_price), spot * 0.015), 5)
  const longCall = sc.find(c => c.details.strike_price >= shortK + wingW * 0.95)
  if (!longCall) return null
  const scP = contractPrice(shortCall), lcP = contractPrice(longCall)
  if (!scP) return null
  const credit = scP - lcP, width = longCall.details.strike_price - shortK, maxLoss = width - credit
  if (credit <= 0 || maxLoss <= 0) return null
  const days = daysToExpiry(shortCall.details.expiration_date)
  const annYield = (credit / maxLoss) * (365 / Math.max(days,1)) * 100
  const pop = popFromDelta(shortCall.greeks?.delta)
  const expMove = spot * (iv30/100) * Math.sqrt(days/365)
  return {
    id: `${ticker}-BCS-${shortCall.details.expiration_date}`,
    ticker, type: 'Bear Call Spread', thesis: 'Bearish',
    legs: [
      { symbol: shortCall.ticker, action: 'SELL', strike: shortK, type: 'CALL', expiry: shortCall.details.expiration_date, price: scP },
      { symbol: longCall.ticker,  action: 'BUY',  strike: longCall.details.strike_price, type: 'CALL', expiry: longCall.details.expiration_date, price: lcP },
    ],
    score: scoreComposite(Math.min(ivRank/100,1), days, Math.min(Math.max(0,(ivHvRatio-0.8)/1.2),1), annYield, pop, { ivr:0.25,dte:0.15,ratio:0.20,yld:0.25,pop:0.15 }),
    pop, premiumYield: +annYield.toFixed(1), maxProfit: +credit.toFixed(2), maxLoss: +maxLoss.toFixed(2),
    breakevens: [+(shortK + credit).toFixed(2)],
    dte: days, ivRank, ivHvRatio, expectedMove: +expMove.toFixed(2), expectedMovePct: +((expMove/spot)*100).toFixed(1),
    edge: `$${credit.toFixed(2)} credit on $${width} spread. ${pop}% PoP. BE $${(shortK+credit).toFixed(2)}.`,
  }
}

// ── Main scan handler ─────────────────────────────────────────────────
export default async function handler(req, res) {
  // Auth check — accept CRON_SECRET or VITE_CRON_SECRET
  const auth     = req.headers.authorization
  const secret   = process.env.CRON_SECRET || process.env.VITE_CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    console.error('[scan] Auth failed. Header:', auth, 'Secret set:', !!secret)
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const skipMarketCheck = req.query.force === '1'
  if (!skipMarketCheck && !isMarketOpen()) {
    return res.status(200).json({ skipped: true, reason: 'Market closed' })
  }

  if (!MASSIVE_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Missing env vars' })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  const from = new Date(Date.now() + 18 * 86_400_000).toISOString().slice(0, 10)
  const to   = new Date(Date.now() + 65 * 86_400_000).toISOString().slice(0, 10)

  // Fetch spot prices for scan universe
  const spotRes = await fetch(
    `https://api.massive.com/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${SCAN_UNIVERSE.join(',')}`,
    { headers: { Authorization: `Bearer ${MASSIVE_KEY}` } }
  )
  const spotData = await spotRes.json()
  const spotMap  = new Map((spotData.tickers ?? []).map(t => [
    t.ticker,
    t.day?.close || t.min?.c || t.prevDay?.c || 0
  ]))

  const allStrategies = []

  for (let i = 0; i < SCAN_UNIVERSE.length; i += 4) {
    const batch = SCAN_UNIVERSE.slice(i, i + 4)
    await Promise.allSettled(batch.map(async ticker => {
      const spot = spotMap.get(ticker)
      if (!spot || spot <= 0) return
      try {
        const contracts = await fetchChain(ticker, from, to)
        if (contracts.length < 5) return

        const iv30 = computeIV30(contracts, spot)
        if (iv30 <= 0) return

        const ivRank    = Math.min(99, Math.round(iv30 * 0.9))
        const ivHvRatio = 1.0  // neutral default

        // Best expiry ~30 DTE
        const expiries = [...new Set(contracts.map(c => c.details.expiration_date))]
          .filter(e => daysToExpiry(e) >= 7).sort()
        if (!expiries.length) return

        const bestExpiry = expiries.reduce((best, e) =>
          Math.abs(daysToExpiry(e) - 30) < Math.abs(daysToExpiry(best) - 30) ? e : best, expiries[0])

        const calls = contracts.filter(c => c.details.expiration_date === bestExpiry && c.details.contract_type === 'call')
          .sort((a,b) => a.details.strike_price - b.details.strike_price)
        const puts  = contracts.filter(c => c.details.expiration_date === bestExpiry && c.details.contract_type === 'put')
          .sort((a,b) => a.details.strike_price - b.details.strike_price)

        for (const fn of [
          () => buildIronCondor(ticker, calls, puts, spot, iv30, ivRank, ivHvRatio),
          () => buildBullPutSpread(ticker, puts, spot, iv30, ivRank, ivHvRatio),
          () => buildBearCallSpread(ticker, calls, spot, iv30, ivRank, ivHvRatio),
          () => buildCashSecuredPut(ticker, puts, spot, iv30, ivRank, ivHvRatio),
        ]) {
          try {
            const s = fn()
            if (s && s.score >= 45) allStrategies.push(s)
          } catch {}
        }
      } catch {}
    }))
  }

  if (!allStrategies.length) {
    return res.status(200).json({ saved: 0, message: 'No strategies found' })
  }

  // Delete scans older than 2 hours, then insert fresh
  await supabase.from('strategy_scans')
    .delete()
    .lt('scanned_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())

  const { error } = await supabase.from('strategy_scans')
    .insert(allStrategies.map(s => ({ data: s })))

  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ saved: allStrategies.length, scanned_at: new Date().toISOString() })
}
