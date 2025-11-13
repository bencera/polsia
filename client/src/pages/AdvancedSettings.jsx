import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Navbar from '../components/Navbar';
import './Settings.css';

function AdvancedSettings() {
  const { token, refreshUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const [companyName, setCompanyName] = useState('');
  const [companySlug, setCompanySlug] = useState('');
  const [publicDashboardEnabled, setPublicDashboardEnabled] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState(null);
  const [checkingSlug, setCheckingSlug] = useState(false);

  // Check if page is embedded in modal
  const isEmbedded = new URLSearchParams(window.location.search).get('embedded') === 'true';

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    // Auto-generate slug when company name changes
    if (companyName && !companySlug) {
      const generatedSlug = generateSlug(companyName);
      setCompanySlug(generatedSlug);
    }
  }, [companyName]);

  useEffect(() => {
    // Check slug availability when it changes (debounced)
    if (companySlug && companySlug.length >= 3) {
      const timer = setTimeout(() => {
        checkSlugAvailability(companySlug);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setSlugAvailable(null);
    }
  }, [companySlug]);

  const generateSlug = (name) => {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);
  };

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/user/settings', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setCompanyName(data.company_name || '');
        setCompanySlug(data.company_slug || '');
        setPublicDashboardEnabled(data.public_dashboard_enabled || false);
      } else {
        setMessage({ type: 'error', text: 'Failed to load settings' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  };

  const checkSlugAvailability = async (slug) => {
    setCheckingSlug(true);
    try {
      const response = await fetch('/api/user/settings/check-slug', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ slug })
      });

      if (response.ok) {
        const data = await response.json();
        setSlugAvailable(data.available ? 'available' : 'taken');
      }
    } catch (err) {
      console.error('Failed to check slug availability:', err);
    } finally {
      setCheckingSlug(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      const response = await fetch('/api/user/settings', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          company_name: companyName,
          company_slug: companySlug,
          public_dashboard_enabled: publicDashboardEnabled
        })
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({ type: 'success', text: 'Settings saved successfully!' });
        setCompanyName(data.company_name || '');
        setCompanySlug(data.company_slug || '');
        setPublicDashboardEnabled(data.public_dashboard_enabled || false);
        // Refresh user data in auth context to update navbar
        await refreshUser();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save settings' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const getPublicDashboardUrl = () => {
    if (!companySlug) return null;
    const baseUrl = window.location.origin;
    return `${baseUrl}/${companySlug}`;
  };

  return (
    <>
      {!isEmbedded && <Navbar />}
      <div className="settings-container">
        <div className="settings-content">
          {!isEmbedded && <h1>Advanced Settings</h1>}

          {loading && <p>Loading settings...</p>}

          {!loading && (
            <>
              <div className="settings-section">
                <h2>Company Information</h2>

                <div className="form-group">
                  <label htmlFor="companyName">Company Name</label>
                  <input
                    id="companyName"
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g., Acme Corp"
                    className="settings-input"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="companySlug">
                    Company Slug (URL)
                    {checkingSlug && <span style={{ marginLeft: '10px', fontSize: '12px' }}>Checking...</span>}
                    {!checkingSlug && slugAvailable === 'available' && (
                      <span style={{ marginLeft: '10px', fontSize: '12px', color: '#00ff00' }}>✓ Available</span>
                    )}
                    {!checkingSlug && slugAvailable === 'taken' && (
                      <span style={{ marginLeft: '10px', fontSize: '12px', color: '#ff0000' }}>✗ Taken</span>
                    )}
                  </label>
                  <input
                    id="companySlug"
                    type="text"
                    value={companySlug}
                    onChange={(e) => setCompanySlug(e.target.value.toLowerCase())}
                    placeholder="e.g., acme-corp"
                    className="settings-input"
                  />
                  <p className="input-hint">
                    Only lowercase letters, numbers, and hyphens (3-50 characters)
                  </p>
                </div>
              </div>

              <div className="settings-section">
                <h2>Public Dashboard</h2>

                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={publicDashboardEnabled}
                      onChange={(e) => setPublicDashboardEnabled(e.target.checked)}
                    />
                    <span style={{ marginLeft: '10px' }}>Enable Public Dashboard</span>
                  </label>
                  <p className="input-hint">
                    Allow anyone with the link to view your task history (read-only)
                  </p>
                </div>

                {publicDashboardEnabled && companySlug && (
                  <div className="public-url-preview">
                    <p style={{ marginBottom: '10px' }}>Your public dashboard:</p>
                    <a
                      href={getPublicDashboardUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#00ff00', textDecoration: 'underline' }}
                    >
                      {getPublicDashboardUrl()}
                    </a>
                  </div>
                )}
              </div>

              {message.text && (
                <div className={`message ${message.type}`}>
                  {message.text}
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={saving || (slugAvailable === 'taken')}
                className="save-button"
                style={{
                  marginTop: '20px',
                  padding: '10px 20px',
                  background: (saving || slugAvailable === 'taken') ? '#666' : 'transparent',
                  border: '1px solid #00ff00',
                  color: '#00ff00',
                  cursor: (saving || slugAvailable === 'taken') ? 'not-allowed' : 'pointer',
                  fontFamily: 'monospace',
                  fontSize: '14px'
                }}
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default AdvancedSettings;
