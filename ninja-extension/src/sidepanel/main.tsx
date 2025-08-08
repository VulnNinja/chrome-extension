import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/index.css'
import Top from './Top.tsx'
import { ThemeProvider } from '@/components/theme-provider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <Top />
    </ThemeProvider>
  </StrictMode>,
)
