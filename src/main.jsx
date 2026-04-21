import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import StyleGuide from './StyleGuide.jsx'
import { AccessibilityProvider } from './accessibility.jsx'
import { I18nProvider } from './i18n/index.jsx'
import { AIConfigProvider } from './agent/config.jsx'

const showStyleGuide = new URLSearchParams(window.location.search).has('styleguide')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <I18nProvider>
      <AccessibilityProvider>
        <AIConfigProvider>
          {showStyleGuide ? <StyleGuide /> : <App />}
        </AIConfigProvider>
      </AccessibilityProvider>
    </I18nProvider>
  </StrictMode>,
)
