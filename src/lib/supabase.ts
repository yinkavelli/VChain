import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export type TradeLeg = {
  action: 'BUY' | 'SELL'
  strike: number
  type: string
  expiry: string
  price: number
}

export type Trade = {
  id: string
  user_id: string
  ticker: string
  strategy_type: string
  strategy_data: { legs: TradeLeg[]; dte: number; breakevens: number[]; max_profit: number; max_loss: number }
  quantity: number
  entry_price: number
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
