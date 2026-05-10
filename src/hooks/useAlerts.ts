import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type AlertCondition = 'price_above' | 'price_below' | 'change_pct_above' | 'change_pct_below' | 'iv_rank_above'

export interface Alert {
  id: string
  user_id: string
  ticker: string
  condition: AlertCondition
  threshold: number
  triggered: boolean
  last_triggered_at: string | null
  created_at: string
}

export const CONDITION_LABELS: Record<AlertCondition, string> = {
  price_above:      'Price above',
  price_below:      'Price below',
  change_pct_above: 'Day % gain >',
  change_pct_below: 'Day % drop >',
  iv_rank_above:    'IV Rank above',
}

export function useAlerts(userId?: string) {
  return useQuery({
    queryKey: ['alerts', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('alerts')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Alert[]
    },
    enabled: !!userId,
    staleTime: 30_000,
  })
}

export function useCreateAlert(userId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (alert: Pick<Alert, 'ticker' | 'condition' | 'threshold'>) => {
      if (!userId) throw new Error('Not signed in')
      const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/alerts`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'apikey':       import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer':       'return=representation',
        },
        body: JSON.stringify({ ...alert, user_id: userId, triggered: false }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Failed to create alert')
      return (Array.isArray(data) ? data[0] : data) as Alert
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts', userId] }),
  })
}

export function useDeleteAlert(userId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('alerts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts', userId] }),
  })
}

export function useResetAlert(userId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('alerts').update({ triggered: false }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts', userId] }),
  })
}

// ── Push subscription registration ────────────────────────────────────

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export async function registerPushSubscription(userId: string): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return false

    const reg = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
    })

    const res = await fetch('/api/push-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), user_id: userId }),
    })
    return res.ok
  } catch { return false }
}
