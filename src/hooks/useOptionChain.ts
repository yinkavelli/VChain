import { useQuery } from '@tanstack/react-query'
import { fetchOptionChain, type OptionContract } from '../lib/massiveApi'

export function useOptionChain(ticker: string, enabled = true) {
  // Fetch up to 2 years of expiries — no expiry filter, large limit
  const twoYearsOut = new Date(Date.now() + 730 * 86_400_000).toISOString().slice(0, 10)
  return useQuery({
    queryKey: ['chain', ticker],
    queryFn:  () => fetchOptionChain(ticker, {
      expiration_date_lte: twoYearsOut,
      limit: 250,
    }),
    enabled:  enabled && !!ticker,
    staleTime: 15 * 60_000,
    refetchInterval: 15 * 60_000,
  })
}

// Get unique expiry dates from a chain
export function getExpiries(contracts: OptionContract[]): string[] {
  return [...new Set(contracts.map(c => c.details.expiration_date))].sort()
}

// Group contracts by strike into call/put pairs for the chain view
export interface ChainRow {
  strike: number
  call?: OptionContract
  put?: OptionContract
  isATM: boolean
}

export function buildChainRows(contracts: OptionContract[], expiry: string, spotPrice: number, strikesEachSide = 6): ChainRow[] {
  const forExpiry = contracts.filter(c => c.details.expiration_date === expiry)
  const strikes   = [...new Set(forExpiry.map(c => c.details.strike_price))].sort((a, b) => a - b)
  const callMap   = new Map(forExpiry.filter(c => c.details.contract_type === 'call').map(c => [c.details.strike_price, c]))
  const putMap    = new Map(forExpiry.filter(c => c.details.contract_type === 'put').map(c => [c.details.strike_price, c]))

  const allRows = strikes.map(strike => ({
    strike,
    call:  callMap.get(strike),
    put:   putMap.get(strike),
    isATM: Math.abs(strike - spotPrice) / spotPrice < 0.015,
  })).filter(r => r.call || r.put)

  // Find ATM index and return 6 strikes each side
  const atmIdx = allRows.reduce((best, r, i) =>
    Math.abs(r.strike - spotPrice) < Math.abs(allRows[best].strike - spotPrice) ? i : best, 0)
  return allRows.slice(Math.max(0, atmIdx - strikesEachSide), atmIdx + strikesEachSide + 1)
}
