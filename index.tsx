import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"

function mountApp() {
  const rootElement = document.getElementById("root")
  if (!rootElement) {
    throw new Error("Could not find root element to mount to")
  }

  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

// Mount immediately if DOM is ready, otherwise wait for DOMContentLoaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountApp)
} else {
  mountApp()
}
