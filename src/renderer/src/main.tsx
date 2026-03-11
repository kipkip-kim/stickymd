import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ManagerWindow from './components/ManagerWindow'
import './theme.css'

// Listen for theme changes — sets data-theme attribute for CSS variable switching.
// This listener is never removed; individual components observe data-theme via MutationObserver.
window.api.onThemeChanged((theme) => {
  document.documentElement.setAttribute('data-theme', theme)
})

// Apply theme before first render to prevent flash, then mount React
async function init(): Promise<void> {
  try {
    const theme = await window.api.getTheme()
    document.documentElement.setAttribute('data-theme', theme)
  } catch {
    // Default to light
  }

  const isManager = /^#manager(\?|$)/.test(window.location.hash)

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      {isManager ? <ManagerWindow /> : <App />}
    </React.StrictMode>
  )
}
init()
