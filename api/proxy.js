// Vercel serverless proxy — adds Massive API Bearer token server-side
// Routes: /api/proxy?p=/v3/snapshot/options/AAPL&...params

export default async function handler(req, res) {
  const url    = new URL(req.url, 'http://localhost')
  const path   = url.searchParams.get('p') || ''
  url.searchParams.delete('p')

  const apiKey = (process.env.MASSIVE_API_KEY || '').trim()
  if (!apiKey) {
    return res.status(500).json({ error: 'Missing MASSIVE_API_KEY env var' })
  }

  const qs       = url.searchParams.toString()
  const upstream = `https://api.massive.com${path}${qs ? '?' + qs : ''}`

  try {
    const response = await fetch(upstream, {
      method:  req.method || 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent':    'VChain/1.0',
      },
    })

    const text = await response.text()
    let parsed
    try { parsed = JSON.parse(text) } catch { /* not JSON */ }

    if (!response.ok && parsed?.message) {
      return res.status(response.status).json({ error: parsed.message, status: parsed.status })
    }

    res
      .status(response.status)
      .setHeader('Content-Type', response.headers.get('content-type') || 'application/json')
      .setHeader('Access-Control-Allow-Origin', '*')
      .send(text)

  } catch (err) {
    res.status(502).json({ error: 'Proxy error', message: err.message })
  }
}
