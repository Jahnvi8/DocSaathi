import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ToastProvider } from "./components/Toaster";
import "./index.css";

// Vite's entry point. In Angular terms, this is like main.ts bootstrapping
// AppModule — except React mounts a single component tree into #root.
// ToastProvider wraps the app so any component can raise toasts via useToast().
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>
);
