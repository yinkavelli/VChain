import { useQuery } from '@tanstack/react-query'
import { fetchMarketStatus } from '../lib/massiveApi'

export function useMarketStatus() {
  return useQuery({
    queryKey: ['market-status'],
    queryFn:  fetchMarketStatus,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })
}
