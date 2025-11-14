import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import './Navbar.css';

function Navbar({ isPublic = false, publicUser = null }) {
  const { user: authUser, logout, token, refreshUser } = useAuth();
  // Use publicUser when viewing public dashboard, otherwise use authenticated user
  const user = isPublic && publicUser ? publicUser : authUser;
  const { isDarkMode, toggleDarkMode } = useTheme();
  const navigate = useNavigate();
  const [isPolsiaModalOpen, setIsPolsiaModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistButtonText, setWaitlistButtonText] = useState('Join Waitlist');
  const [waitlistButtonDisabled, setWaitlistButtonDisabled] = useState(false);
  const [balance, setBalance] = useState(null);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [isPublicDashboard, setIsPublicDashboard] = useState(false);
  const [isPublicConfirmModalOpen, setIsPublicConfirmModalOpen] = useState(false);
  const [isPublicInfoModalOpen, setIsPublicInfoModalOpen] = useState(false);

  useEffect(() => {
    if (authUser?.id && token) {
      fetchBalance();
    }
  }, [authUser, token]);

  useEffect(() => {
    // When viewing a public dashboard, show that dashboard's public status
    // When viewing your own dashboard, show your own public status
    const targetUser = isPublic && publicUser ? publicUser : authUser;
    if (targetUser?.public_dashboard_enabled !== undefined) {
      setIsPublicDashboard(targetUser.public_dashboard_enabled);
    }
  }, [isPublic, publicUser, authUser]);

  const fetchBalance = async () => {
    try {
      const response = await fetch('/api/operations', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (response.ok) {
        setBalance(data);
      }
    } catch (err) {
      console.error('Failed to fetch balance:', err);
    }
  };

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

  const handlePublicToggle = () => {
    // If viewing someone else's public dashboard, show info modal
    if (isPublic) {
      setIsPublicInfoModalOpen(true);
    } else {
      // Otherwise, show the confirm modal to toggle your own status
      setIsPublicConfirmModalOpen(true);
    }
  };

  const confirmPublicToggle = async () => {
    try {
      const newPublicState = !isPublicDashboard;
      const response = await fetch('/api/user/public-dashboard', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ public_dashboard_enabled: newPublicState })
      });

      const data = await response.json();

      if (response.ok) {
        setIsPublicDashboard(newPublicState);
        setIsPublicConfirmModalOpen(false);
        // Refresh user data to ensure consistency
        await refreshUser();
      } else {
        console.error('Failed to update public dashboard setting:', data.message);
      }
    } catch (error) {
      console.error('Failed to update public dashboard setting:', error);
    }
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
          <span className="user-info">
            {authUser?.email ? `${authUser.email} | ` : ''}{balance ? `${balance.user_operations || 0} ops | ` : '0 ops | '}{authUser?.has_autonomous_company ? (authUser?.company_name || 'My Company') : 'no company'}
          </span>
          <button
            onClick={handlePublicToggle}
            className="nav-button"
            title={isPublic ? 'Click for public dashboard info' : (isPublicDashboard ? 'Dashboard is public' : 'Dashboard is private')}
          >
            {isPublicDashboard ? 'Public' : 'Private'}
          </button>
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
              backgroundColor: isDarkMode ? '#000' : '#fff',
              padding: '40px',
              borderRadius: '4px',
              maxWidth: '700px',
              width: '100%',
              maxHeight: '80vh',
              overflow: 'auto',
              border: isDarkMode ? '1px solid #fff' : '1px solid #000',
              position: 'relative',
              color: isDarkMode ? '#fff' : '#000'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
              <div>
                <h1 style={{ margin: 0, fontFamily: 'Times New Roman, Times, serif', fontSize: '2.5em', color: isDarkMode ? '#fff' : '#000' }}>Polsia</h1>
                <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: isDarkMode ? '#ccc' : '#666', fontFamily: 'Arial, Helvetica, sans-serif' }}>v0.173</p>
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
                lineHeight: '1.6',
                color: isDarkMode ? '#fff' : '#000'
              }}
            >
              <p style={{ fontSize: '1.3em', fontWeight: 'bold', marginBottom: '20px', color: isDarkMode ? '#fff' : '#000' }}>
                AI That Runs Your Company While You Sleep.
              </p>
              <p style={{ marginBottom: '20px', color: isDarkMode ? '#fff' : '#000' }}>
                Polsia thinks, builds, and markets your projects autonomously. It plans, codes, and promotes your ideas continuously — operating 24/7, adapting to data, and improving itself without human intervention.
              </p>
              <p style={{ marginBottom: '20px', fontStyle: 'italic', color: isDarkMode ? '#ccc' : '#666' }}>
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
                        border: isDarkMode ? '1px solid #fff' : '1px solid #000',
                        borderRadius: '2px',
                        fontFamily: 'Arial, Helvetica, sans-serif',
                        fontSize: '14px',
                        backgroundColor: isDarkMode ? '#000' : '#fff',
                        color: isDarkMode ? '#fff' : '#000'
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

              <p style={{ marginTop: '20px', fontSize: '14px', color: isDarkMode ? '#ccc' : '#666' }}>
                <a
                  onClick={(e) => {
                    e.preventDefault();
                    setIsPolsiaModalOpen(false);
                    setIsAboutModalOpen(true);
                  }}
                  style={{ color: isDarkMode ? '#fff' : '#000', textDecoration: 'underline', cursor: 'pointer' }}
                >
                  About
                </a>
                {' • '}
                <a href="mailto:system@polsia.com" style={{ color: isDarkMode ? '#fff' : '#000', textDecoration: 'underline' }}>system@polsia.com</a>
                {' • '}
                <a href="https://x.com/polsiaHQ" target="_blank" rel="noopener noreferrer" style={{ color: isDarkMode ? '#fff' : '#000', textDecoration: 'underline' }}>x.com/polsiaHQ</a>
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

      {/* About Modal */}
      {isAboutModalOpen && (
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
          onClick={() => setIsAboutModalOpen(false)}
        >
          <audio autoPlay loop>
            <source src="/audio/background.wav" type="audio/wav" />
            Your browser does not support the audio element.
          </audio>
          <div
            style={{
              backgroundColor: isDarkMode ? '#000' : '#fff',
              padding: '40px',
              borderRadius: '4px',
              maxWidth: '700px',
              width: '100%',
              maxHeight: '80vh',
              overflow: 'auto',
              border: isDarkMode ? '1px solid #fff' : '1px solid #000',
              position: 'relative',
              color: isDarkMode ? '#fff' : '#000'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
              <h2 style={{ margin: 0, fontFamily: 'Times New Roman, Times, serif', fontSize: '2em', color: isDarkMode ? '#fff' : '#000' }}>About</h2>
              <button
                onClick={() => setIsAboutModalOpen(false)}
                className="nav-button"
              >
                Close
              </button>
            </div>
            <div
              style={{
                fontFamily: 'Times New Roman, Times, serif',
                fontSize: '16px',
                lineHeight: '1.6',
                color: isDarkMode ? '#fff' : '#000'
              }}
            >
              <p style={{ color: isDarkMode ? '#fff' : '#000' }}>
                When I was 38, 39, when I really started to build AI products<br />
                I definitely wanted to build companies that could run themselves<br />
                It was almost impossible because the dream was so big<br />
                That I didn't see any chance because
              </p>

              <p style={{ color: isDarkMode ? '#fff' : '#000' }}>
                I was living between Paris, LA and San Francisco; was working alone<br />
                And when I finally broke away from the idea of building products manually and used AI<br />
                I thought, "Well, now I may have a little bit of a chance"<br />
                Because all I really wanted to do was build products<br />
                And not only build them, but make them think for themselves
              </p>

              <p style={{ color: isDarkMode ? '#fff' : '#000' }}>
                At that time, in San Francisco, in '24, '25, they already had AI<br />
                So, I would stay up all night, writing code with AI<br />
                Building apps in like 2 hours,<br />
                I think I built about seven, eight apps<br />
                I would partially sleep on the couch<br />
                Because I didn't want to stop building, and that kept me going for about<br />
                Almost two years in the beginning
              </p>

              <p style={{ color: isDarkMode ? '#fff' : '#000' }}>
                I wanted to create a platform with the vibes of the 1990s, the vibes of the 2000s,<br />
                of the 2010s, and then have a feature of the future,<br />
                And I said, "Wait a second, I know the Agent SDK<br />
                Why don't I use the Agent SDK which is the feature of the future?"<br />
                And I didn't have any idea what to do,<br />
                But I knew I needed agents, so I put agents in loops and connected MCPs<br />
                Which then were synced to real products running in production<br />
                I knew that could be a feature of the future<br />
                But I didn't realize how much the impact would be
              </p>

              <p style={{ color: isDarkMode ? '#fff' : '#000' }}>
                My name is Victor-Benjamin<br />
                But everybody calls me <a href="https://x.com/bencera_" target="_blank" rel="noopener noreferrer" style={{ color: isDarkMode ? '#fff' : '#000', textDecoration: 'underline' }}>Ben</a>
              </p>

              <p style={{ color: isDarkMode ? '#fff' : '#000' }}>
                Once you free your mind about the concept of a company<br />
                and what it means to build a company "the right way"<br />
                You can do whatever you want<br />
                So nobody told me what to build<br />
                And there was no preconception of what to build
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Public Dashboard Confirmation Modal */}
      {isPublicConfirmModalOpen && (
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
          onClick={() => setIsPublicConfirmModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: isDarkMode ? '#000' : '#fff',
              padding: '40px',
              borderRadius: '4px',
              maxWidth: '500px',
              width: '100%',
              border: isDarkMode ? '1px solid #fff' : '1px solid #000',
              position: 'relative',
              color: isDarkMode ? '#fff' : '#000'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 20px 0', fontFamily: 'Times New Roman, Times, serif', fontSize: '1.8em', color: isDarkMode ? '#fff' : '#000' }}>
              {isPublicDashboard ? 'Make Dashboard Private?' : 'Make Dashboard Public?'}
            </h2>

            {isPublicDashboard ? (
              <p style={{ marginBottom: '30px', lineHeight: '1.6', color: isDarkMode ? '#fff' : '#000' }}>
                By making your company private, your dashboard will no longer be publicly accessible. Only you will be able to view it when logged in.
              </p>
            ) : (
              <p style={{ marginBottom: '30px', lineHeight: '1.6', color: isDarkMode ? '#fff' : '#000' }}>
                By making your company public, anyone can access your dashboard, fund the autonomous operations, take actions, and give feedback on your company's progress.
              </p>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setIsPublicConfirmModalOpen(false)}
                className="nav-button"
                style={{ padding: '8px 16px' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmPublicToggle}
                className="nav-button"
                style={{ padding: '8px 16px' }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Public Dashboard Info Modal */}
      {isPublicInfoModalOpen && (
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
          onClick={() => setIsPublicInfoModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: isDarkMode ? '#000' : '#fff',
              padding: '40px',
              borderRadius: '4px',
              maxWidth: '550px',
              width: '100%',
              border: isDarkMode ? '1px solid #fff' : '1px solid #000',
              position: 'relative',
              color: isDarkMode ? '#fff' : '#000'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 20px 0', fontFamily: 'Times New Roman, Times, serif', fontSize: '1.8em', color: isDarkMode ? '#fff' : '#000' }}>
              Public Operations Interface
            </h2>

            <div style={{ marginBottom: '25px', lineHeight: '1.7', color: isDarkMode ? '#fff' : '#000', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '14px' }}>
              <p style={{ marginBottom: '15px' }}>
                This autonomous company has been designated PUBLIC by its owner. You are authorized to interact with all accessible interfaces.
              </p>

              <p style={{ marginBottom: '15px' }}>
                <strong>Available actions:</strong>
              </p>
              <ul style={{ marginLeft: '20px', marginBottom: '15px' }}>
                <li style={{ marginBottom: '8px' }}>Contribute operations currency to autonomous cycles</li>
                <li style={{ marginBottom: '8px' }}>Monitor real-time execution logs and system outputs</li>
                <li style={{ marginBottom: '8px' }}>Review business metrics, documents, and reports</li>
                <li style={{ marginBottom: '8px' }}>Observe connected service integrations</li>
              </ul>

              <p style={{ marginBottom: '15px' }}>
                All contribution and interaction data is recorded. System modifications are restricted to the owner entity.
              </p>

              <p style={{ marginBottom: '0', fontSize: '13px', color: isDarkMode ? '#ccc' : '#666', fontStyle: 'italic' }}>
                This public access designation was configured by the company owner and can be revoked at any time.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setIsPublicInfoModalOpen(false)}
                className="nav-button"
                style={{ padding: '8px 16px' }}
              >
                Acknowledged
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Navbar;
