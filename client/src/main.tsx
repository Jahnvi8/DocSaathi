import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Vite's entry point. In Angular terms, this is like main.ts bootstrapping
// AppModule — except React mounts a single component tree into #root.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
