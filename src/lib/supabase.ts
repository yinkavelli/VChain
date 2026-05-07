import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export type Trade = {
  id: string
  user_id: string
  ticker: string
  symbol: string            // OCC symbol e.g. O:AAPL250620C00150000
  side: 'BUY' | 'SELL'
  option_side: 'call' | 'put'
  quantity: number
  entry_price: number
  strike_price: number
  expiry_date: string       // YYYY-MM-DD
  status: 'OPEN' | 'CLOSED'
  exit_price?: number
  exit_time?: string
  created_at: string
}

export type PnlSnapshot = {
  id: string
  user_id: string
  total_pnl: number
  snapshot_at: string
}

export type IVHistory = {
  id: string
  ticker: string
  iv30: number
  date: string
}
