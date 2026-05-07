import { StrictMode } from 'react'
// Always dark mode
document.documentElement.classList.add('dark')
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5 * 60_000 } }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
