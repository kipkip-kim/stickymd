import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ManagerWindow from './components/ManagerWindow'

// Hash-based routing: #manager → ManagerWindow, default → memo App
const isManager = window.location.hash.startsWith('#manager')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isManager ? <ManagerWindow /> : <App />}
  </React.StrictMode>
)
