// Frontend entry point for Nexus POS
// This file sets up routing, context providers, and theme.
// No secrets or API keys are hard‑coded; all credentials come from the backend via environment variables.
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { BusinessProvider, useBusiness } from './context/BusinessContext';
import { SocketProvider } from './context/SocketContext';
import AdminDashboard from './pages/AdminDashboard';
import AdminLogin from './pages/AdminLogin';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Onboarding from './pages/Onboarding';
import LandingPage from './pages/LandingPage';
import DashboardLayout from './pages/DashboardLayout';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Sales from './pages/Sales';
import Expenses from './pages/Expenses';
import Debts from './pages/Debts';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import SalesRecords from './pages/SalesRecords';
import LegalPrivacy from './pages/LegalPrivacy';
import LegalTerms from './pages/LegalTerms';
import Support from './pages/Support';
import Impersonate from './pages/Impersonate';

// Protected Route Guard
function ProtectedRoute({ children }) {
  const { currentUser } = useAuth();
  const { loadingBusiness, needsOnboarding, business, isAdmin } = useBusiness();

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (loadingBusiness) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
        <p className="text-slate-500 text-sm">Loading workspace...</p>
      </div>
    );
  }

  // If user is a Super Admin, they belong in /admin, not the merchant /app
  if (isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  if (needsOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }
  
  if (!business) {
    return <Navigate to="/onboarding" replace />;
  }

  return children;
}

// Onboarding Route Guard
function OnboardingRoute({ children }) {
  const { currentUser } = useAuth();
  const { loadingBusiness, needsOnboarding, isAdmin } = useBusiness();

  if (!currentUser) return <Navigate to="/login" replace />;
  
  if (loadingBusiness) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
        <p className="text-slate-500 text-sm">Loading...</p>
      </div>
    );
  }

  // If they don't need onboarding, push them back to their respective dashboards
  if (!needsOnboarding) {
    return <Navigate to={isAdmin ? "/admin" : "/app/dashboard"} replace />;
  }
  
  return children;
}

// Admin Route Guard
function AdminRoute({ children }) {
  const { currentUser } = useAuth();
  const { loadingBusiness, isAdmin } = useBusiness();

  if (!currentUser) return <Navigate to="/admin/login" replace />;
  
  if (loadingBusiness) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
        <p className="text-slate-500 text-sm">Verifying authority...</p>
      </div>
    );
  }

  // Non-admin users have no business in the admin panel — send to admin login
  if (!isAdmin) return <Navigate to="/admin/login" replace />;
  
  return children;
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BusinessProvider>
          <SocketProvider>
            <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <Routes>
                {/* Public Route */}
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<Login />} />
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/impersonate" element={<Impersonate />} />
                <Route path="/privacy" element={<LegalPrivacy />} />
                <Route path="/terms" element={<LegalTerms />} />
                <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
                
                {/* Onboarding Route */}
                <Route path="/onboarding" element={<OnboardingRoute><Onboarding /></OnboardingRoute>} />
              
                {/* Protected App Routes */}
                <Route path="/app" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
                  <Route index element={<Navigate to="dashboard" replace />} />
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="products" element={<Products />} />
                  <Route path="sales" element={<Sales />} />
                  <Route path="sales/history" element={<SalesRecords />} />
                  <Route path="support" element={<Support />} />
                  <Route path="expenses" element={<Expenses />} />
                  <Route path="debts" element={<Debts />} />
                  <Route path="reports" element={<Reports />} />
                  <Route path="settings" element={<Settings />} />
                </Route>
                
                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
          </Router>
        </SocketProvider>
      </BusinessProvider>
    </AuthProvider>
  </ThemeProvider>
  );
}

export default App;
