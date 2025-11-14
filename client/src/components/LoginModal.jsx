import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import '../pages/Dashboard.css';

function LoginModal({ isOpen, onClose, onSuccess, onSwitchToSignup }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Login the user
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      // Save token and user data
      localStorage.setItem('token', data.token);

      // Call the onSuccess callback with user data before closing
      if (onSuccess) {
        await onSuccess(data.token, data.user);
      }

      // Close modal
      onClose();

    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px'
      }}
      onClick={handleBackdropClick}
    >
      <div
        style={{
          backgroundColor: '#fff',
          padding: '40px',
          borderRadius: '4px',
          maxWidth: '450px',
          width: '100%',
          border: '1px solid #000',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
          <h2 style={{ margin: 0, fontFamily: 'Times New Roman, Times, serif', fontSize: '24px' }}>Log In</h2>
          <button
            onClick={onClose}
            className="dashboard-btn"
          >
            Close
          </button>
        </div>

        {error && (
          <div style={{
            backgroundColor: '#ffe6e6',
            border: '1px solid #cc0000',
            borderRadius: '4px',
            padding: '12px',
            marginBottom: '20px',
            color: '#cc0000',
            fontSize: '13px'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label
              htmlFor="email"
              style={{
                display: 'block',
                marginBottom: '8px',
                fontFamily: 'Arial, Helvetica, sans-serif',
                fontSize: '14px',
                fontWeight: 'bold'
              }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="your@email.com"
              autoComplete="email"
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ccc',
                borderRadius: '2px',
                fontFamily: 'Arial, Helvetica, sans-serif',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: '25px' }}>
            <label
              htmlFor="password"
              style={{
                display: 'block',
                marginBottom: '8px',
                fontFamily: 'Arial, Helvetica, sans-serif',
                fontSize: '14px',
                fontWeight: 'bold'
              }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              autoComplete="current-password"
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ccc',
                borderRadius: '2px',
                fontFamily: 'Arial, Helvetica, sans-serif',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="dashboard-btn"
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '14px',
              opacity: loading ? 0.6 : 1,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Logging in...' : 'Log In'}
          </button>

          <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '13px', color: '#666', fontFamily: 'Arial, Helvetica, sans-serif' }}>
            Don't have an account?{' '}
            <button
              type="button"
              onClick={onSwitchToSignup}
              style={{
                background: 'none',
                border: 'none',
                color: '#000',
                textDecoration: 'underline',
                cursor: 'pointer',
                padding: 0,
                font: 'inherit'
              }}
            >
              Create account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default LoginModal;
