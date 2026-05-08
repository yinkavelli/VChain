// Vercel Cron entry — delegates to /api/scan
export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  // Forward to shared scan handler with same auth
  const origin = `https://${req.headers.host}`
  const result = await fetch(`${origin}/api/scan`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  })
  const data = await result.json()
  return res.status(result.status).json(data)
}
