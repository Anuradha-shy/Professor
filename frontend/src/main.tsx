import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { queryClient } from './lib/queryClient'

if ('serviceWorker' in navigator) {
  const registerServiceWorker = () => {
    void navigator.serviceWorker.register('/service-worker.js', { updateViaCache: 'none' })
  }
  if (document.readyState === 'complete') registerServiceWorker()
  else window.addEventListener('load', registerServiceWorker, { once: true })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
