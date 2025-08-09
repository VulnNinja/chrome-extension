import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/index.css'
import '@/styles/globals.css'
import Router from './routes/Router.tsx'
import { ThemeProvider } from '@/components/theme-provider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <div className='bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'>
        <Router />
      </div>
    </ThemeProvider>
  </StrictMode>,
)
