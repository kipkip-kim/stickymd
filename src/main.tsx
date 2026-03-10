import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { StickyApp } from "./StickyApp";
import "./styles/globals.css";

const params = new URLSearchParams(window.location.search);
const isSticky = params.get("sticky") === "true";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isSticky ? <StickyApp /> : <App />}
  </React.StrictMode>,
);
