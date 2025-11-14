import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Navbar from '../components/Navbar';
import './Settings.css';

function Profile() {
  const navigate = useNavigate();
  const { user, token: contextToken, refreshUser } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [twitterHandle, setTwitterHandle] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Check if page is embedded in modal
  const isEmbedded = new URLSearchParams(window.location.search).get('embedded') === 'true';

  // Get token from context or fallback to localStorage (for iframe)
  const token = contextToken || localStorage.getItem('token');

  console.log('Profile page loaded:', { isEmbedded, hasToken: !!token, hasUser: !!user });

  // Load user data on mount
  useEffect(() => {
    if (user) {
      setFullName(user.full_name || '');
      setEmail(user.email || '');
      setTwitterHandle(user.twitter_handle || '');
    }
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    console.log('Submitting profile update...', { fullName, email, twitterHandle });

    try {
      const response = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          full_name: fullName,
          email: email,
          twitter_handle: twitterHandle
        })
      });

      console.log('Response status:', response.status);

      const data = await response.json();
      console.log('Response data:', data);

      if (response.ok) {
        setMessage('Profile updated successfully!');
        // Refresh user data
        if (refreshUser) {
          await refreshUser();
        }
        setTimeout(() => setMessage(''), 3000);
      } else {
        setError(data.message || data.error || 'Failed to update profile');
      }
    } catch (err) {
      console.error('Error updating profile:', err);
      setError(`Failed to update profile: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {!isEmbedded && <Navbar />}

      <div className="settings-container">
        <div className="settings-content">
          {!isEmbedded && (
            <div className="settings-header">
              <button
                onClick={() => navigate('/settings')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#000',
                  cursor: 'pointer',
                  fontSize: '14px',
                  padding: '0 0 10px 0',
                  fontFamily: 'Times New Roman, Times, serif'
                }}
              >
                ← Back to Settings
              </button>
              <h2>Profile</h2>
              <p className="settings-subtitle">
                Manage your personal information
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="profile-form">
            <div className="form-group">
              <label htmlFor="fullName">Full Name</label>
              <input
                type="text"
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full name"
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                className="form-input"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="twitterHandle">Twitter Handle</label>
              <input
                type="text"
                id="twitterHandle"
                value={twitterHandle}
                onChange={(e) => setTwitterHandle(e.target.value)}
                placeholder="@username"
                className="form-input"
              />
              <small style={{ color: '#666', fontSize: '12px', marginTop: '5px', display: 'block' }}>
                Optional: Include the @ symbol
              </small>
            </div>

            {message && (
              <div style={{
                padding: '12px',
                backgroundColor: '#d4edda',
                border: '1px solid #c3e6cb',
                color: '#155724',
                borderRadius: '4px',
                marginBottom: '15px',
                fontFamily: 'Times New Roman, Times, serif'
              }}>
                {message}
              </div>
            )}

            {error && (
              <div style={{
                padding: '12px',
                backgroundColor: '#f8d7da',
                border: '1px solid #f5c6cb',
                color: '#721c24',
                borderRadius: '4px',
                marginBottom: '15px',
                fontFamily: 'Times New Roman, Times, serif'
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="dashboard-btn"
              style={{ marginTop: '10px' }}
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </form>

          {!isEmbedded && (
            <footer className="footer">
              <p className="footer-contact">Contact: <a href="mailto:system@polsia.ai">system@polsia.ai</a></p>
            </footer>
          )}
        </div>
      </div>
    </>
  );
}

export default Profile;
