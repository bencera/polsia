import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TerminalProvider } from './contexts/TerminalContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import Landing from './pages/Landing';
import About from './pages/About';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AgentsPage from './pages/AgentsPage';
import Brain from './pages/Brain';
import Tasks from './pages/Tasks';
import Settings from './pages/Settings';
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
          </Routes>
        </Router>
      </TerminalProvider>
    </AuthProvider>
  )
}

export default App
