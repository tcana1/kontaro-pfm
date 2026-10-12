
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n";
import { FinanceProvider } from "@/contexts/finance-context";
import { AuthProvider } from "@/contexts/auth-context";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

// A tab opened before a deploy may import() a hashed chunk that no longer exists.
// Reload to pick up the new index.html. The timestamp guard skips a reload within
// 10s of the previous one, so a genuinely unreachable chunk can't cause a loop
// while a later deploy in a long-lived tab still reloads.
window.addEventListener("vite:preloadError", () => {
  const last = Number(sessionStorage.getItem("vite-preload-reloaded-at") ?? 0);
  if (Date.now() - last < 10_000) return;
  sessionStorage.setItem("vite-preload-reloaded-at", String(Date.now()));
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <FinanceProvider>
        <App />
      </FinanceProvider>
    </AuthProvider>
  </QueryClientProvider>
);
