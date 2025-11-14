import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TerminalProvider } from './contexts/TerminalContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import Landing from './pages/Landing';
import About from './pages/About';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AgentsPage from './pages/AgentsPage';
import Brain from './pages/Brain';
import Tasks from './pages/Tasks';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import Connections from './pages/Connections';
import Documents from './pages/Documents';
import Analytics from './pages/Analytics';
import Tools from './pages/Tools';
import CostTracking from './pages/CostTracking';
import ModuleCosts from './pages/ModuleCosts';
import AdvancedSettings from './pages/AdvancedSettings';
import PublicDashboard from './pages/PublicDashboard';
import './App.css'

// Component that redirects to dashboard if already logged in
function LandingOrDashboard() {
  const { isAuthenticated, loading } = useAuth();

  // Show nothing while checking auth status
  if (loading) {
    return null;
  }

  // Redirect to dashboard if already logged in
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  // Show landing page if not logged in
  return <Landing />;
}

// Component that redirects to dashboard if already logged in
function LoginOrDashboard() {
  const { isAuthenticated, loading } = useAuth();

  // Show nothing while checking auth status
  if (loading) {
    return null;
  }

  // Redirect to dashboard if already logged in
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  // Show login page if not logged in
  return <Login />;
}

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <TerminalProvider>
          <Router>
            <Routes>
            <Route path="/" element={<LandingOrDashboard />} />
            <Route path="/about" element={<About />} />
            <Route path="/login" element={<LoginOrDashboard />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/brain"
              element={
                <ProtectedRoute>
                  <Brain />
                </ProtectedRoute>
              }
            />
            <Route
              path="/tasks"
              element={
                <ProtectedRoute>
                  <Tasks />
                </ProtectedRoute>
              }
            />
            <Route
              path="/agents"
              element={
                <ProtectedRoute>
                  <AgentsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/connections"
              element={
                <ProtectedRoute>
                  <Connections />
                </ProtectedRoute>
              }
            />
            <Route
              path="/documents"
              element={
                <ProtectedRoute>
                  <Documents />
                </ProtectedRoute>
              }
            />
            <Route
              path="/analytics"
              element={
                <ProtectedRoute>
                  <Analytics />
                </ProtectedRoute>
              }
            />
            <Route
              path="/tools"
              element={
                <ProtectedRoute>
                  <Tools />
                </ProtectedRoute>
              }
            />
            <Route
              path="/cost-tracking"
              element={
                <ProtectedRoute>
                  <CostTracking />
                </ProtectedRoute>
              }
            />
            <Route
              path="/module-costs"
              element={
                <ProtectedRoute>
                  <ModuleCosts />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/advanced"
              element={
                <ProtectedRoute>
                  <AdvancedSettings />
                </ProtectedRoute>
              }
            />
            {/* Public dashboard route - MUST be last to avoid conflicts */}
            <Route path="/:company_slug" element={<PublicDashboard />} />
            </Routes>
          </Router>
        </TerminalProvider>
      </ThemeProvider>
    </AuthProvider>
  )
}

export default App
