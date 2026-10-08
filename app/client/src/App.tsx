import { Switch, Route, Redirect } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import Layout from "@/components/layout/layout";
import Dashboard from "@/pages/dashboard";
import Transactions from "@/pages/transactions";
import Accounts from "@/pages/accounts";
import AccountTransactions from "@/pages/account-transactions";
import Categories from "@/pages/categories";
import CategorySetup from "@/pages/category-setup";
import Tags from "@/pages/tags";
import CategorizationRules from "@/pages/categorization-rules";
import Reports from "@/pages/reports";
import Settings from "@/pages/settings";
import NotFound from "@/pages/not-found";
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider } from '@/contexts/auth-context';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { OnboardingProvider } from '@/components/onboarding/onboarding-context';
import Login from '@/pages/login';
import AuthCallback from '@/pages/auth/callback';
import ResetPassword from '@/pages/auth/reset-password';

import Profile from '@/pages/profile';


function Router() {
  return (
    <Switch>
      <Route path="/login">
        <Login />
      </Route>
      <Route path="/auth/callback">
        <AuthCallback />
      </Route>
      <Route path="/auth/reset-password">
        <ResetPassword />
      </Route>
      <Route path="*">
        <Layout>
          <Switch>
            <Route path="/dashboard">
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            </Route>
            <Route path="/transactions">
              <ProtectedRoute>
                <Transactions />
              </ProtectedRoute>
            </Route>
            <Route path="/accounts/:accountId/transactions">
              <ProtectedRoute>
                <AccountTransactions />
              </ProtectedRoute>
            </Route>
            <Route path="/accounts">
              <ProtectedRoute>
                <Accounts />
              </ProtectedRoute>
            </Route>
            <Route path="/categories">
              <ProtectedRoute>
                <Categories />
              </ProtectedRoute>
            </Route>
            <Route path="/categories/rules">
              <ProtectedRoute>
                <CategorizationRules />
              </ProtectedRoute>
            </Route>
            <Route path="/categories/setup">
              <ProtectedRoute>
                <CategorySetup />
              </ProtectedRoute>
            </Route>
            <Route path="/tags">
              <ProtectedRoute>
                <Tags />
              </ProtectedRoute>
            </Route>
            <Route path="/reports">
              <ProtectedRoute>
                <Reports />
              </ProtectedRoute>
            </Route>
            <Route path="/settings">
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            </Route>
            <Route path="/profile">
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            </Route>
            <Route path="/">
              <Redirect to="/dashboard" />
            </Route>
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <OnboardingProvider>
          <Router />
          <Toaster />
        </OnboardingProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;