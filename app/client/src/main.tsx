
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n";
import { FinanceProvider } from "@/contexts/finance-context";
import { AuthProvider } from "@/contexts/auth-context";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <FinanceProvider>
        <App />
      </FinanceProvider>
    </AuthProvider>
  </QueryClientProvider>
);
