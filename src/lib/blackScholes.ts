function normCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989423 * Math.exp(-(x * x) / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))))
  return x >= 0 ? 1 - p : p
}

export function bsPrice(S: number, K: number, T: number, r: number, sigma: number, type: 'call' | 'put'): number {
  if (T <= 0 || sigma <= 0) return Math.max(0, type === 'call' ? S - K : K - S)
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * Math.sqrt(T))
  const d2 = d1 - sigma * Math.sqrt(T)
  return type === 'call'
    ? S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2)
    : K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1)
}

export function solveIV(price: number, S: number, K: number, T: number, type: 'call' | 'put', r = 0.045): number {
  if (T <= 0 || price <= 0 || S <= 0 || K <= 0) return 0
  let sigma = 0.5
  for (let i = 0; i < 100; i++) {
    const theoretical = bsPrice(S, K, T, r, sigma, type)
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * Math.sqrt(T))
    const vega = S * Math.sqrt(T) * Math.exp(-(d1 * d1) / 2) / Math.sqrt(2 * Math.PI)
    if (vega < 1e-10) break
    sigma -= (theoretical - price) / vega
    if (sigma <= 0.001) sigma = 0.001
    if (sigma > 20) return 0
    if (Math.abs(theoretical - price) < 0.0001) break
  }
  return sigma > 0 && sigma < 20 ? +(sigma * 100).toFixed(2) : 0
}
