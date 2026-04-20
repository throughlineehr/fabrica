import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import StyleGuide from './StyleGuide.jsx'

const showStyleGuide = new URLSearchParams(window.location.search).has('styleguide')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {showStyleGuide ? <StyleGuide /> : <App />}
  </StrictMode>,
)
