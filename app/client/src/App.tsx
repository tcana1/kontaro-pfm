import { lazy, Suspense } from "react";
import { Switch, Route, Redirect } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { Spinner } from "@/components/ui/spinner";
import Layout from "@/components/layout/layout";
import Dashboard from "@/pages/dashboard";
import NotFound from "@/pages/not-found";
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider } from '@/contexts/auth-context';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { OnboardingProvider } from '@/components/onboarding/onboarding-context';
import Login from '@/pages/login';
import AuthCallback from '@/pages/auth/callback';
import ResetPassword from '@/pages/auth/reset-password';

const Transactions = lazy(() => import('@/pages/transactions'));
const Accounts = lazy(() => import('@/pages/accounts'));
const AccountTransactions = lazy(() => import('@/pages/account-transactions'));
const Categories = lazy(() => import('@/pages/categories'));
const CategorySetup = lazy(() => import('@/pages/category-setup'));
const Tags = lazy(() => import('@/pages/tags'));
const CategorizationRules = lazy(() => import('@/pages/categorization-rules'));
const Reports = lazy(() => import('@/pages/reports'));
const Settings = lazy(() => import('@/pages/settings'));
const Profile = lazy(() => import('@/pages/profile'));


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
          <Suspense fallback={<div className="flex items-center justify-center py-20"><Spinner size="lg" /></div>}>
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
          </Suspense>
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