// Vercel cron — runs every 5 minutes
// vercel.json: { "crons": [{ "path": "/api/alerts-check", "schedule": "*/5 * * * *" }] }
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const POLYGON_BASE = 'https://api.polygon.io'

async function getSnapshot(tickers: string[]): Promise<Map<string, { price: number; changePct: number }>> {
  const url = `${POLYGON_BASE}/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickers.join(',')}&apiKey=${process.env.POLYGON_API_KEY}`
  const res = await fetch(url)
  const data = await res.json() as { tickers: Array<{ ticker: string; day: { c: number }; todaysChangePerc: number }> }
  const map = new Map<string, { price: number; changePct: number }>()
  for (const t of data.tickers ?? []) {
    map.set(t.ticker, { price: t.day?.c ?? 0, changePct: t.todaysChangePerc ?? 0 })
  }
  return map
}

interface Alert {
  id: string
  user_id: string
  ticker: string
  condition: 'price_above' | 'price_below' | 'change_pct_above' | 'change_pct_below' | 'iv_rank_above'
  threshold: number
  triggered: boolean
  last_triggered_at: string | null
}

interface PushSub {
  user_id: string
  subscription: string
}

function shouldNotify(alert: Alert, price: number, changePct: number): boolean {
  if (alert.condition === 'price_above')      return price      >= alert.threshold
  if (alert.condition === 'price_below')      return price      <= alert.threshold
  if (alert.condition === 'change_pct_above') return changePct  >= alert.threshold
  if (alert.condition === 'change_pct_below') return changePct  <= alert.threshold
  return false
}

function alertMessage(alert: Alert, price: number, changePct: number): { title: string; body: string } {
  const p = `$${price.toFixed(2)}`
  const c = `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`
  if (alert.condition === 'price_above')      return { title: `${alert.ticker} above $${alert.threshold}`, body: `Now trading at ${p} (${c})` }
  if (alert.condition === 'price_below')      return { title: `${alert.ticker} below $${alert.threshold}`, body: `Now trading at ${p} (${c})` }
  if (alert.condition === 'change_pct_above') return { title: `${alert.ticker} up ${c} today`, body: `Price: ${p} · Alert: >${alert.threshold}%` }
  if (alert.condition === 'change_pct_below') return { title: `${alert.ticker} down ${c} today`, body: `Price: ${p} · Alert: <${alert.threshold}%` }
  return { title: `${alert.ticker} alert`, body: `Price: ${p}` }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel cron sends GET; also allow POST for manual testing with secret
  const secret = req.headers['x-cron-secret'] ?? req.query['secret']
  if (req.method === 'POST' && secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Fetch all active (non-triggered) alerts
  const { data: alerts, error: alertErr } = await supabase
    .from('alerts')
    .select('*')
    .eq('triggered', false)

  if (alertErr) return res.status(500).json({ error: alertErr.message })
  if (!alerts || alerts.length === 0) return res.status(200).json({ checked: 0 })

  const tickers = [...new Set((alerts as Alert[]).map(a => a.ticker))]
  const snapshot = await getSnapshot(tickers)

  // Fetch all push subscriptions for affected users
  const userIds = [...new Set((alerts as Alert[]).map(a => a.user_id))]
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('user_id, subscription')
    .in('user_id', userIds)

  const subsByUser = new Map<string, string[]>()
  for (const s of (subs ?? []) as PushSub[]) {
    if (!subsByUser.has(s.user_id)) subsByUser.set(s.user_id, [])
    subsByUser.get(s.user_id)!.push(s.subscription)
  }

  let fired = 0
  for (const alert of alerts as Alert[]) {
    const snap = snapshot.get(alert.ticker)
    if (!snap) continue
    if (!shouldNotify(alert, snap.price, snap.changePct)) continue

    const { title, body } = alertMessage(alert, snap.price, snap.changePct)
    const userSubs = subsByUser.get(alert.user_id) ?? []

    await Promise.allSettled(userSubs.map(rawSub => {
      const sub = JSON.parse(rawSub) as webpush.PushSubscription
      return webpush.sendNotification(sub, JSON.stringify({ title, body, tag: alert.ticker, url: '/' }))
    }))

    // Mark triggered + timestamp
    await supabase.from('alerts').update({
      triggered: true,
      last_triggered_at: new Date().toISOString(),
    }).eq('id', alert.id)

    fired++
  }

  return res.status(200).json({ checked: alerts.length, fired })
}
