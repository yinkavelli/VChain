import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { subscription, user_id } = req.body as {
    subscription: PushSubscriptionJSON
    user_id: string
  }

  if (!subscription?.endpoint || !user_id) {
    return res.status(400).json({ error: 'Missing subscription or user_id' })
  }

  const { error } = await supabase.from('push_subscriptions').upsert(
    { user_id, endpoint: subscription.endpoint, subscription: JSON.stringify(subscription) },
    { onConflict: 'endpoint' }
  )

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ ok: true })
}
