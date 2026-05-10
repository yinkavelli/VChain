import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

async function getSession() {
  return (await supabase.auth.getSession()).data.session
}

export function useWatchlist(userId?: string) {
  return useQuery({
    queryKey: ['watchlist', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('watchlist')
        .select('ticker')
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []).map(r => r.ticker) as string[]
    },
    enabled: !!userId,
    staleTime: 5 * 60_000,
  })
}

export function useToggleWatchlist(userId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ticker, watched }: { ticker: string; watched: boolean }) => {
      if (!userId) throw new Error('Not signed in')
      const session = await getSession()
      const headers = {
        'apikey':        import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type':  'application/json',
      }
      const base = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/watchlist`

      if (watched) {
        // Remove
        await fetch(`${base}?ticker=eq.${encodeURIComponent(ticker)}&user_id=eq.${userId}`, {
          method: 'DELETE', headers,
        })
      } else {
        // Add
        await fetch(base, {
          method: 'POST',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ user_id: userId, ticker }),
        })
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['watchlist', userId] }),
  })
}
