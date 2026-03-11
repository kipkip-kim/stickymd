import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ManagerWindow from './components/ManagerWindow'

// Hash-based routing: #manager or #manager?tab=... → ManagerWindow, default → memo App
const isManager = /^#manager(\?|$)/.test(window.location.hash)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isManager ? <ManagerWindow /> : <App />}
  </React.StrictMode>
)
