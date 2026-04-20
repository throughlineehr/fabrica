import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import StyleGuide from './StyleGuide.jsx'
import { AccessibilityProvider } from './accessibility.jsx'

const showStyleGuide = new URLSearchParams(window.location.search).has('styleguide')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AccessibilityProvider>
      {showStyleGuide ? <StyleGuide /> : <App />}
    </AccessibilityProvider>
  </StrictMode>,
)
