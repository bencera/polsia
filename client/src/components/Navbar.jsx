import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import './Navbar.css';

function Navbar({ isPublic = false }) {
  const { user, logout } = useAuth();
  const { isDarkMode, toggleDarkMode } = useTheme();
  const navigate = useNavigate();
  const [isPolsiaModalOpen, setIsPolsiaModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistButtonText, setWaitlistButtonText] = useState('Join Waitlist');
  const [waitlistButtonDisabled, setWaitlistButtonDisabled] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleHome = () => {
    navigate('/dashboard');
  };

  const handleTasks = () => {
    navigate('/tasks');
  };

  const handleAgents = () => {
    navigate('/agents');
  };

  const handleSettings = () => {
    setIsSettingsModalOpen(true);
  };

  const handlePolsiaClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsPolsiaModalOpen(true);
  };

  const isValidEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleWaitlistSubmit = async (e) => {
    e.preventDefault();
    const trimmedEmail = waitlistEmail.trim();

    if (trimmedEmail && isValidEmail(trimmedEmail)) {
      setWaitlistButtonText('PROCESSING...');
      setWaitlistButtonDisabled(true);

      try {
        const response = await fetch('/api/waitlist', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: trimmedEmail,
            variant: 'autonomous'
          }),
        });

        const data = await response.json();

        if (data.success) {
          setWaitlistButtonText('ADDED TO QUEUE');
          setWaitlistEmail('');

          // Redirect to Typeform with pre-filled email
          setTimeout(() => {
            window.location.href = `https://form.typeform.com/to/W4lyrtBc#email=${encodeURIComponent(trimmedEmail)}&variant=autonomous`;
          }, 800);
        } else {
          setWaitlistButtonText('ERROR');
          setTimeout(() => {
            setWaitlistButtonText('Join Waitlist');
            setWaitlistButtonDisabled(false);
          }, 2000);
        }
      } catch (error) {
        setWaitlistButtonText('ERROR');
        setTimeout(() => {
          setWaitlistButtonText('Join Waitlist');
          setWaitlistButtonDisabled(false);
        }, 2000);
      }
    } else {
      const input = document.getElementById('modal-email-input');
      if (input) {
        input.style.borderColor = '#ff4444';
        setTimeout(() => {
          input.style.borderColor = '';
        }, 1000);
      }
    }
  };

  return (
    <>
      <nav className="navbar">
        <div className="navbar-brand-container">
          <Link to="/dashboard" className="navbar-brand">
            {user?.company_name || 'My Company'}
          </Link>
          <button
            type="button"
            onClick={handlePolsiaClick}
            className="nav-button"
            style={{ marginLeft: '10px' }}
          >
            Run by Polsia
          </button>
        </div>
        <div className="navbar-actions">
          <span className="user-info">{user?.email}</span>
          <button onClick={toggleDarkMode} className="nav-button" title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
            {isDarkMode ? 'Light' : 'Dark'}
          </button>
          <button onClick={handleSettings} className="nav-button">
            Settings
          </button>
        </div>
      </nav>

      {/* Polsia Info Modal */}
      {isPolsiaModalOpen && (
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
          onClick={() => setIsPolsiaModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              padding: '40px',
              borderRadius: '4px',
              maxWidth: '700px',
              width: '100%',
              maxHeight: '80vh',
              overflow: 'auto',
              border: '1px solid #000',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
              <div>
                <h1 style={{ margin: 0, fontFamily: 'Times New Roman, Times, serif', fontSize: '2.5em' }}>Polsia</h1>
                <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#666', fontFamily: 'Arial, Helvetica, sans-serif' }}>v0.431</p>
              </div>
              <button
                onClick={() => setIsPolsiaModalOpen(false)}
                className="nav-button"
              >
                Close
              </button>
            </div>
            <div
              style={{
                fontFamily: 'Times New Roman, Times, serif',
                fontSize: '16px',
                lineHeight: '1.6'
              }}
            >
              <p style={{ fontSize: '1.3em', fontWeight: 'bold', marginBottom: '20px' }}>
                AI That Runs Your Company While You Sleep.
              </p>
              <p style={{ marginBottom: '20px' }}>
                Polsia thinks, builds, and markets your projects autonomously. It plans, codes, and promotes your ideas continuously — operating 24/7, adapting to data, and improving itself without human intervention.
              </p>
              <p style={{ marginBottom: '20px', fontStyle: 'italic', color: '#666' }}>
                Warning: System operates independently. Human oversight recommended.
              </p>

              {/* Waitlist Form - Only show on public dashboards */}
              {isPublic && (
                <form onSubmit={handleWaitlistSubmit} style={{ marginTop: '30px', marginBottom: '30px' }}>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <input
                      type="email"
                      id="modal-email-input"
                      placeholder="your@email.com"
                      value={waitlistEmail}
                      onChange={(e) => setWaitlistEmail(e.target.value)}
                      disabled={waitlistButtonDisabled}
                      style={{
                        flex: '1',
                        minWidth: '200px',
                        padding: '8px 12px',
                        border: '1px solid #000',
                        borderRadius: '2px',
                        fontFamily: 'Arial, Helvetica, sans-serif',
                        fontSize: '14px'
                      }}
                    />
                    <button
                      type="submit"
                      className="nav-button"
                      disabled={waitlistButtonDisabled}
                      style={{ padding: '8px 16px', minWidth: '120px' }}
                    >
                      {waitlistButtonText}
                    </button>
                  </div>
                </form>
              )}

              <p style={{ marginTop: '20px', fontSize: '14px', color: '#666' }}>
                Contact: <a href="mailto:system@polsia.com" style={{ color: '#000', textDecoration: 'underline' }}>system@polsia.com</a>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsModalOpen && (
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
          onClick={() => setIsSettingsModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '4px',
              maxWidth: '1200px',
              width: '100%',
              maxHeight: '90vh',
              height: '90vh',
              border: '1px solid #000',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              position: 'sticky',
              top: 0,
              backgroundColor: '#fff',
              zIndex: 1,
              padding: '20px 30px',
              borderBottom: '1px solid #ddd',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{ margin: 0, fontFamily: 'Times New Roman, Times, serif' }}>Settings</h2>
              <button
                onClick={() => setIsSettingsModalOpen(false)}
                className="nav-button"
              >
                Close
              </button>
            </div>
            <iframe
              src="/settings?embedded=true"
              style={{
                flex: 1,
                border: 'none',
                width: '100%',
                height: '100%'
              }}
              title="Settings"
            />
          </div>
        </div>
      )}
    </>
  );
}

export default Navbar;
