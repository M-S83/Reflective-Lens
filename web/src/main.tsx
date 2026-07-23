import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { EntitlementProvider } from "./lib/entitlements";
import { ModeProvider } from "./lib/mode";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <EntitlementProvider>
          <ModeProvider>
            <App />
          </ModeProvider>
        </EntitlementProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
