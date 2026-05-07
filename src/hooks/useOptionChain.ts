import { useQuery } from '@tanstack/react-query'
import { fetchOptionChain, type OptionContract } from '../lib/massiveApi'

export function useOptionChain(
  ticker: string,
  expiry?: string,
  contractType?: 'call' | 'put',
  enabled = true
) {
  return useQuery({
    queryKey: ['chain', ticker, expiry, contractType],
    queryFn:  () => fetchOptionChain(ticker, {
      expiration_date: expiry,
      contract_type:   contractType,
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

export function buildChainRows(contracts: OptionContract[], expiry: string, spotPrice: number): ChainRow[] {
  const forExpiry = contracts.filter(c => c.details.expiration_date === expiry)
  const strikes   = [...new Set(forExpiry.map(c => c.details.strike_price))].sort((a, b) => a - b)
  const callMap   = new Map(forExpiry.filter(c => c.details.contract_type === 'call').map(c => [c.details.strike_price, c]))
  const putMap    = new Map(forExpiry.filter(c => c.details.contract_type === 'put').map(c => [c.details.strike_price, c]))

  return strikes.map(strike => ({
    strike,
    call:  callMap.get(strike),
    put:   putMap.get(strike),
    isATM: Math.abs(strike - spotPrice) / spotPrice < 0.015,
  })).filter(r => r.call || r.put)
}
