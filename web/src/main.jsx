import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import StyleGuide from './StyleGuide.jsx'
import { InvitePage } from './pages/InvitePage.jsx'
import { DownloadPage } from './pages/DownloadPage.jsx'
import { AccessibilityProvider } from './accessibility.jsx'
import { I18nProvider } from './i18n/index.jsx'
import { AIConfigProvider } from './agent/config.jsx'
import { BusProvider } from './signals/BusContext.jsx'

function Router() {
  const path = window.location.pathname
  const showStyleGuide = new URLSearchParams(window.location.search).has('styleguide')

  // Invite page: /invite/{token}
  if (path.startsWith('/invite/')) {
    const token = path.split('/invite/')[1]
    return <InvitePage token={token} />
  }

  // Download page: /download
  if (path === '/download') {
    return <DownloadPage />
  }

  // Style guide: ?styleguide
  if (showStyleGuide) {
    return <StyleGuide />
  }

  // Default: main app
  return (
    <AIConfigProvider>
      <BusProvider>
        <App />
      </BusProvider>
    </AIConfigProvider>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <I18nProvider>
      <AccessibilityProvider>
        <Router />
      </AccessibilityProvider>
    </I18nProvider>
  </StrictMode>,
)
