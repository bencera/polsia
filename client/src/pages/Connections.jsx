import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTerminal } from '../contexts/TerminalContext';
import Navbar from '../components/Navbar';
import './Connections.css';

function Connections() {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [showRepoSelector, setShowRepoSelector] = useState(false);
  const [availableRepos, setAvailableRepos] = useState([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [primaryRepo, setPrimaryRepo] = useState(null);
  const { token } = useAuth();
  const { terminalLogs } = useTerminal();

  useEffect(() => {
    fetchConnections();

    // Check for OAuth callback messages in URL
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const errorParam = params.get('error');

    if (success === 'github_connected') {
      setSuccessMessage('GitHub account connected successfully!');
      // Clear URL parameters
      window.history.replaceState({}, '', '/connections');
      // Refresh connections after a brief delay
      setTimeout(() => {
        fetchConnections();
        setSuccessMessage('');
      }, 3000);
    } else if (success === 'gmail_connected') {
      setSuccessMessage('Gmail account connected successfully!');
      // Clear URL parameters
      window.history.replaceState({}, '', '/connections');
      // Refresh connections after a brief delay
      setTimeout(() => {
        fetchConnections();
        setSuccessMessage('');
      }, 3000);
    } else if (success === 'instagram_connected') {
      const username = params.get('username');
      setSuccessMessage(`Instagram account ${username ? `@${username}` : ''} connected successfully!`);
      // Clear URL parameters
      window.history.replaceState({}, '', '/connections');
      // Refresh connections after a brief delay
      setTimeout(() => {
        fetchConnections();
        setSuccessMessage('');
      }, 3000);
    } else if (success === 'meta_ads_connected') {
      setSuccessMessage('Meta Ads account connected successfully!');
      // Clear URL parameters
      window.history.replaceState({}, '', '/connections');
      // Refresh connections after a brief delay
      setTimeout(() => {
        fetchConnections();
        setSuccessMessage('');
      }, 3000);
    } else if (success === 'sentry_connected') {
      setSuccessMessage('Sentry account connected successfully!');
      // Clear URL parameters
      window.history.replaceState({}, '', '/connections');
      // Refresh connections after a brief delay
      setTimeout(() => {
        fetchConnections();
        setSuccessMessage('');
      }, 3000);
    } else if (errorParam) {
      const errorMessages = {
        'invalid_state': 'OAuth security validation failed. Please try again.',
        'no_code': 'Authorization failed. Please try again.',
        'no_token': 'Failed to obtain access token.',
        'oauth_failed': 'OAuth process failed. Please try again.',
        'instagram_session_expired': 'Instagram session expired. Please try connecting again.',
        'instagram_connection_failed': 'Instagram connection failed. Make sure you have an Instagram Business or Creator account connected to a Facebook Page, and that you granted all required permissions.',
        'instagram_invalid_callback': 'Invalid Instagram callback. Please try again.',
        'instagram_failed': 'Instagram connection failed. Please try again.',
        'invalid_callback': 'Invalid callback parameters. Please try again.',
        'meta_ads_access_denied': 'Meta Ads access denied. Please grant all required permissions.',
        'meta_ads_token_exchange_failed': 'Failed to exchange token for long-lived access. Please try again.',
        'meta_ads_invalid_callback': 'Invalid Meta Ads callback. Please try again.',
        'meta_ads_failed': 'Meta Ads connection failed. Please try again.',
        'sentry_access_denied': 'Sentry access denied. Please grant all required permissions.',
        'sentry_invalid_token_expiry': 'Invalid token expiry received from Sentry. Please try again.',
        'sentry_invalid_callback': 'Invalid Sentry callback. Please try again.',
        'sentry_failed': 'Sentry connection failed. Please try again.'
      };
      setError(errorMessages[errorParam] || 'An error occurred during connection.');
    }
  }, []);

  const fetchConnections = async () => {
    try {
      const response = await fetch('/api/connections', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setConnections(data.connections);
      } else {
        setError(data.message || 'Failed to load connections');
      }
    } catch (err) {
      setError('Failed to load connections. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const connectGitHub = () => {
    // Redirect to GitHub OAuth flow
    // Auto-detect backend URL based on current domain
    const isProduction = window.location.hostname !== 'localhost';
    const backendUrl = isProduction
      ? window.location.origin // Use same domain in production (https://polsia.ai)
      : (import.meta.env.VITE_API_URL || 'http://localhost:3000'); // Use env var or localhost in dev

    window.location.href = `${backendUrl}/api/auth/github?token=${token}`;
  };

  const connectGmail = () => {
    // Redirect to Gmail OAuth flow
    // Auto-detect backend URL based on current domain
    const isProduction = window.location.hostname !== 'localhost';
    const backendUrl = isProduction
      ? window.location.origin // Use same domain in production (https://polsia.ai)
      : (import.meta.env.VITE_API_URL || 'http://localhost:3000'); // Use env var or localhost in dev

    window.location.href = `${backendUrl}/api/auth/gmail?token=${token}`;
  };

  const connectInstagram = () => {
    // Redirect to Instagram OAuth flow (via Late.dev)
    // Auto-detect backend URL based on current domain
    const isProduction = window.location.hostname !== 'localhost';
    const backendUrl = isProduction
      ? window.location.origin // Use same domain in production (https://polsia.ai)
      : (import.meta.env.VITE_API_URL || 'http://localhost:3000'); // Use env var or localhost in dev

    window.location.href = `${backendUrl}/api/auth/instagram?token=${token}`;
  };

  const connectMetaAds = () => {
    // Redirect to Meta Ads OAuth flow
    // Auto-detect backend URL based on current domain
    const isProduction = window.location.hostname !== 'localhost';
    const backendUrl = isProduction
      ? window.location.origin // Use same domain in production (https://polsia.ai)
      : (import.meta.env.VITE_API_URL || 'http://localhost:3000'); // Use env var or localhost in dev

    window.location.href = `${backendUrl}/api/auth/meta-ads?token=${token}`;
  };

  const disconnectGitHub = async (connectionId) => {
    if (!confirm('Are you sure you want to disconnect your GitHub account?')) {
      return;
    }

    setUpdating(connectionId);

    try {
      const response = await fetch(`/api/auth/github/${connectionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        // Remove the connection from the list
        setConnections(connections.filter(conn => conn.id !== connectionId));
        setSuccessMessage('GitHub account disconnected successfully!');
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        alert(data.error || 'Failed to disconnect GitHub');
      }
    } catch (err) {
      alert('Failed to disconnect GitHub. Please try again.');
    } finally {
      setUpdating(null);
    }
  };

  const disconnectGmail = async (connectionId) => {
    if (!confirm('Are you sure you want to disconnect your Gmail account?')) {
      return;
    }

    setUpdating(connectionId);

    try {
      const response = await fetch(`/api/auth/gmail/${connectionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        // Remove the connection from the list
        setConnections(connections.filter(conn => conn.id !== connectionId));
        setSuccessMessage('Gmail account disconnected successfully!');
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        alert(data.error || 'Failed to disconnect Gmail');
      }
    } catch (err) {
      alert('Failed to disconnect Gmail. Please try again.');
    } finally {
      setUpdating(null);
    }
  };

  const disconnectInstagram = async (connectionId) => {
    if (!confirm('Are you sure you want to disconnect your Instagram account?')) {
      return;
    }

    setUpdating(connectionId);

    try {
      const response = await fetch(`/api/auth/instagram/${connectionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        // Remove the connection from the list
        setConnections(connections.filter(conn => conn.id !== connectionId));
        setSuccessMessage('Instagram account disconnected successfully!');
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        alert(data.error || 'Failed to disconnect Instagram');
      }
    } catch (err) {
      alert('Failed to disconnect Instagram. Please try again.');
    } finally {
      setUpdating(null);
    }
  };

  const disconnectMetaAds = async (connectionId) => {
    if (!confirm('Are you sure you want to disconnect your Meta Ads account?')) {
      return;
    }

    setUpdating(connectionId);

    try {
      const response = await fetch(`/api/auth/meta-ads/${connectionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        // Remove the connection from the list
        setConnections(connections.filter(conn => conn.id !== connectionId));
        setSuccessMessage('Meta Ads account disconnected successfully!');
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        alert(data.error || 'Failed to disconnect Meta Ads');
      }
    } catch (err) {
      alert('Failed to disconnect Meta Ads. Please try again.');
    } finally {
      setUpdating(null);
    }
  };

  const connectSentry = () => {
    // Redirect to Sentry OAuth flow
    // Auto-detect backend URL based on current domain
    const isProduction = window.location.hostname !== 'localhost';
    const backendUrl = isProduction
      ? window.location.origin // Use same domain in production
      : (import.meta.env.VITE_API_URL || 'http://localhost:3000'); // Use env var or localhost in dev

    window.location.href = `${backendUrl}/api/auth/sentry?token=${token}`;
  };

  const disconnectSentry = async (connectionId) => {
    if (!confirm('Are you sure you want to disconnect your Sentry account?')) {
      return;
    }

    setUpdating(connectionId);

    try {
      const response = await fetch(`/api/auth/sentry/${connectionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        // Remove the connection from the list
        setConnections(connections.filter(conn => conn.id !== connectionId));
        setSuccessMessage('Sentry account disconnected successfully!');
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        alert(data.error || 'Failed to disconnect Sentry');
      }
    } catch (err) {
      alert('Failed to disconnect Sentry. Please try again.');
    } finally {
      setUpdating(null);
    }
  };

  const toggleConnection = async (connectionId, currentStatus) => {
    setUpdating(connectionId);
    const newStatus = currentStatus === 'connected' ? 'disconnected' : 'connected';

    try {
      const response = await fetch(`/api/connections/${connectionId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus })
      });

      const data = await response.json();

      if (response.ok) {
        setConnections(connections.map(conn =>
          conn.id === connectionId ? { ...conn, status: newStatus} : conn
        ));
      } else {
        alert(data.message || 'Failed to update connection');
      }
    } catch (err) {
      alert('Failed to update connection. Please try again.');
    } finally {
      setUpdating(null);
    }
  };

  // Fetch GitHub repositories
  const fetchGitHubRepos = async () => {
    setLoadingRepos(true);
    try {
      const response = await fetch('/api/connections/github/repos', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setAvailableRepos(data.repos);
        setShowRepoSelector(true);
      } else {
        alert(data.message || 'Failed to fetch repositories');
      }
    } catch (err) {
      alert('Failed to fetch repositories. Please try again.');
    } finally {
      setLoadingRepos(false);
    }
  };

  // Fetch current primary repo
  const fetchPrimaryRepo = async () => {
    try {
      const response = await fetch('/api/connections/github/primary-repo', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok && data.primary_repo) {
        setPrimaryRepo(data.primary_repo);
      }
    } catch (err) {
      console.error('Failed to fetch primary repo:', err);
    }
  };

  // Set primary repository
  const setPrimaryRepository = async (owner, repo, branch) => {
    try {
      const response = await fetch('/api/connections/github/primary-repo', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ owner, repo, branch: branch || 'main' })
      });

      const data = await response.json();

      if (response.ok) {
        setPrimaryRepo(data.primary_repo);
        setShowRepoSelector(false);
        setSuccessMessage('Primary repository updated successfully!');
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        alert(data.message || 'Failed to set primary repository');
      }
    } catch (err) {
      alert('Failed to set primary repository. Please try again.');
    }
  };

  // Load primary repo when connections load
  useEffect(() => {
    if (connections.find(c => c.service_name === 'github')) {
      fetchPrimaryRepo();
    }
  }, [connections]);

  const getServiceIcon = (serviceName) => {
    const icons = {
      github: '🐙',
      gmail: '📧',
      instagram: '📷',
      'meta-ads': '📊',
      notion: '📝',
      slack: '💬',
      default: '🔗'
    };
    return icons[serviceName.toLowerCase()] || icons.default;
  };

  // Format log for terminal display
  const formatLogMessage = (log) => {
    const time = new Date(log.timestamp).toLocaleTimeString();
    return `[${time}] ${log.stage ? `[${log.stage}] ` : ''}${log.message}`;
  };

  // Get last 4 logs for terminal display
  const displayLogs = terminalLogs.slice(-4);

  return (
    <div className="settings-container">
      <div className="terminal">
        {displayLogs.length === 0 ? (
          // Show 4 lines when idle
          <>
            <div>&gt; Autonomous Operations Control</div>
            <div>&nbsp;</div>
            <div>&nbsp;</div>
            <div>&nbsp;</div>
          </>
        ) : (
          // Show logs and fill remaining lines
          <>
            {displayLogs.map((log, index) => (
              <div key={`${log.id}-${index}`}>&gt; {formatLogMessage(log)}</div>
            ))}
            {displayLogs.length < 4 &&
              Array.from({ length: 4 - displayLogs.length }).map((_, i) => (
                <div key={`empty-${i}`}>&nbsp;</div>
              ))
            }
          </>
        )}
      </div>

      <Navbar />

      <div className="settings-content">
        <div className="settings-header">
          <h2>Connections</h2>
          <p>Manage your service connections</p>
        </div>

        {loading && (
          <div className="loading-state">
            <p>Loading connections...</p>
          </div>
        )}

        {successMessage && (
          <div className="success-state">
            <p>{successMessage}</p>
          </div>
        )}

        {error && (
          <div className="error-state">
            <p>{error}</p>
          </div>
        )}

        {/* GitHub Connect Button (show if not connected) */}
        {!loading && !connections.find(c => c.service_name === 'github') && (
          <div className="connection-card github-connect-card">
            <div className="connection-header">
              <div className="service-info">
                <div>
                  <h3>GitHub</h3>
                  <p className="service-description">Connect your GitHub account to enable code reading and pushing</p>
                </div>
              </div>
            </div>
            <button
              className="connect-button"
              onClick={connectGitHub}
              disabled={updating === 'github'}
            >
              {updating === 'github' ? 'Connecting...' : 'Connect GitHub'}
            </button>
          </div>
        )}

        {/* Gmail Connect Button (show if not connected) */}
        {!loading && !connections.find(c => c.service_name === 'gmail') && (
          <div className="connection-card gmail-connect-card">
            <div className="connection-header">
              <div className="service-info">
                <div>
                  <h3>Gmail</h3>
                  <p className="service-description">Connect your Gmail account to read, send, and manage emails</p>
                </div>
              </div>
            </div>
            <button
              className="connect-button"
              onClick={connectGmail}
              disabled={updating === 'gmail'}
            >
              {updating === 'gmail' ? 'Connecting...' : 'Connect Gmail'}
            </button>
          </div>
        )}

        {/* Instagram Connect Button (show if not connected) */}
        {!loading && !connections.find(c => c.service_name === 'instagram') && (
          <div className="connection-card instagram-connect-card">
            <div className="connection-header">
              <div className="service-info">
                <div>
                  <h3>Instagram</h3>
                  <p className="service-description">Connect your Instagram Business account to post and manage content</p>
                </div>
              </div>
            </div>
            <button
              className="connect-button"
              onClick={connectInstagram}
              disabled={updating === 'instagram'}
            >
              {updating === 'instagram' ? 'Connecting...' : 'Connect Instagram'}
            </button>
          </div>
        )}

        {/* Meta Ads Connect Button (show if not connected) */}
        {!loading && !connections.find(c => c.service_name === 'meta-ads') && (
          <div className="connection-card meta-ads-connect-card">
            <div className="connection-header">
              <div className="service-info">
                <div>
                  <h3>Meta Ads</h3>
                  <p className="service-description">Connect your Meta (Facebook) Ads account to manage campaigns and track performance</p>
                </div>
              </div>
            </div>
            <button
              className="connect-button"
              onClick={connectMetaAds}
              disabled={updating === 'meta-ads'}
            >
              {updating === 'meta-ads' ? 'Connecting...' : 'Connect Meta Ads'}
            </button>
          </div>
        )}

        {!loading && !connections.find(c => c.service_name === 'sentry') && (
          <div className="connection-card sentry-connect-card">
            <div className="connection-header">
              <div className="service-info">
                <div>
                  <h3>Sentry</h3>
                  <p className="service-description">Connect Sentry to monitor errors and performance issues in real-time</p>
                </div>
              </div>
            </div>
            <button
              className="connect-button"
              onClick={connectSentry}
              disabled={updating === 'sentry'}
            >
              {updating === 'sentry' ? 'Connecting...' : 'Connect Sentry'}
            </button>
          </div>
        )}

        {!loading && !error && connections.length === 0 && !connections.find(c => c.service_name === 'github') && !connections.find(c => c.service_name === 'gmail') && !connections.find(c => c.service_name === 'instagram') && !connections.find(c => c.service_name === 'meta-ads') && !connections.find(c => c.service_name === 'sentry') && (
          <div className="empty-state">
            <p>No other service connections found.</p>
          </div>
        )}

        {!loading && !error && connections.length > 0 && (
          <div className="connections-grid">
            {connections.map((connection) => (
              <div key={connection.id} className="connection-card">
                <div className="connection-header">
                  <div className="service-info">
                    <div>
                      <h3>{connection.service_name}</h3>
                      <span className={`connection-status ${connection.status}`}>
                        {connection.status}
                      </span>
                    </div>
                  </div>

                  {connection.service_name === 'github' || connection.service_name === 'gmail' || connection.service_name === 'instagram' || connection.service_name === 'meta-ads' || connection.service_name === 'sentry' ? (
                    <button
                      className="disconnect-button"
                      onClick={() => {
                        if (connection.service_name === 'github') disconnectGitHub(connection.id);
                        else if (connection.service_name === 'gmail') disconnectGmail(connection.id);
                        else if (connection.service_name === 'instagram') disconnectInstagram(connection.id);
                        else if (connection.service_name === 'meta-ads') disconnectMetaAds(connection.id);
                        else if (connection.service_name === 'sentry') disconnectSentry(connection.id);
                      }}
                      disabled={updating === connection.id}
                    >
                      {updating === connection.id ? 'Disconnecting...' : 'Disconnect'}
                    </button>
                  ) : (
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={connection.status === 'connected'}
                        onChange={() => toggleConnection(connection.id, connection.status)}
                        disabled={updating === connection.id}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  )}
                </div>

                {/* GitHub-specific metadata */}
                {connection.service_name === 'github' && connection.metadata && (
                  <div className="connection-metadata github-metadata">
                    {connection.metadata.avatar_url && (
                      <div className="github-avatar">
                        <img
                          src={connection.metadata.avatar_url}
                          alt={connection.metadata.username}
                        />
                      </div>
                    )}
                    <div className="metadata-details">
                      {connection.metadata.username && (
                        <div className="metadata-item">
                          <p className="metadata-label">Username:</p>
                          <p className="metadata-value">
                            <a
                              href={connection.metadata.profile_url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              @{connection.metadata.username}
                            </a>
                          </p>
                        </div>
                      )}
                      {connection.metadata.public_repos !== undefined && (
                        <div className="metadata-item">
                          <p className="metadata-label">Public Repositories:</p>
                          <p className="metadata-value">{connection.metadata.public_repos}</p>
                        </div>
                      )}
                      <div className="metadata-item">
                        <p className="metadata-label">Primary Repository:</p>
                        <p className="metadata-value">
                          {primaryRepo ? (
                            <span>
                              {primaryRepo.full_name}
                              <button
                                className="change-repo-button"
                                onClick={fetchGitHubRepos}
                                disabled={loadingRepos}
                              >
                                {loadingRepos ? 'Loading...' : 'Change'}
                              </button>
                            </span>
                          ) : (
                            <button
                              className="set-repo-button"
                              onClick={fetchGitHubRepos}
                              disabled={loadingRepos}
                            >
                              {loadingRepos ? 'Loading...' : 'Set Primary Repo'}
                            </button>
                          )}
                        </p>
                      </div>
                      <div className="metadata-item">
                        <p className="metadata-label">Connected since:</p>
                        <p className="metadata-value">
                          {new Date(connection.created_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Repository Selector Modal */}
                {connection.service_name === 'github' && showRepoSelector && (
                  <div className="repo-selector-modal">
                    <div className="modal-header">
                      <h4>Select Primary Repository</h4>
                      <button
                        className="modal-close"
                        onClick={() => setShowRepoSelector(false)}
                      >
                        ×
                      </button>
                    </div>
                    <div className="repo-list">
                      {availableRepos.length === 0 ? (
                        <p>No repositories found</p>
                      ) : (
                        availableRepos.map((repo) => (
                          <div
                            key={repo.id}
                            className="repo-item"
                            onClick={() => setPrimaryRepository(repo.owner, repo.name, repo.default_branch)}
                          >
                            <div className="repo-info">
                              <strong>{repo.full_name}</strong>
                              {repo.description && <p>{repo.description}</p>}
                              <small>{repo.language || 'No language'} • {repo.private ? 'Private' : 'Public'}</small>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Gmail-specific metadata */}
                {connection.service_name === 'gmail' && connection.metadata && (
                  <div className="connection-metadata gmail-metadata">
                    {connection.metadata.picture && (
                      <div className="gmail-avatar">
                        <img
                          src={connection.metadata.picture}
                          alt={connection.metadata.email}
                        />
                      </div>
                    )}
                    <div className="metadata-details">
                      {connection.metadata.email && (
                        <div className="metadata-item">
                          <p className="metadata-label">Email:</p>
                          <p className="metadata-value">{connection.metadata.email}</p>
                        </div>
                      )}
                      {connection.metadata.name && (
                        <div className="metadata-item">
                          <p className="metadata-label">Name:</p>
                          <p className="metadata-value">{connection.metadata.name}</p>
                        </div>
                      )}
                      <div className="metadata-item">
                        <p className="metadata-label">Connected since:</p>
                        <p className="metadata-value">
                          {new Date(connection.created_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Instagram-specific metadata */}
                {connection.service_name === 'instagram' && connection.metadata && (
                  <div className="connection-metadata instagram-metadata">
                    <div className="metadata-details">
                      {connection.metadata.username && (
                        <div className="metadata-item">
                          <p className="metadata-label">Username:</p>
                          <p className="metadata-value">@{connection.metadata.username}</p>
                        </div>
                      )}
                      {connection.metadata.platform && (
                        <div className="metadata-item">
                          <p className="metadata-label">Platform:</p>
                          <p className="metadata-value">{connection.metadata.platform}</p>
                        </div>
                      )}
                      <div className="metadata-item">
                        <p className="metadata-label">Connected since:</p>
                        <p className="metadata-value">
                          {new Date(connection.created_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Meta Ads-specific metadata */}
                {connection.service_name === 'meta-ads' && connection.metadata && (
                  <div className="connection-metadata meta-ads-metadata">
                    <div className="metadata-details">
                      {connection.metadata.name && (
                        <div className="metadata-item">
                          <p className="metadata-label">Name:</p>
                          <p className="metadata-value">{connection.metadata.name}</p>
                        </div>
                      )}
                      {connection.metadata.email && (
                        <div className="metadata-item">
                          <p className="metadata-label">Email:</p>
                          <p className="metadata-value">{connection.metadata.email}</p>
                        </div>
                      )}
                      {connection.metadata.ad_accounts && connection.metadata.ad_accounts.length > 0 && (
                        <div className="metadata-item">
                          <p className="metadata-label">Ad Accounts:</p>
                          <p className="metadata-value">
                            {connection.metadata.ad_accounts.length} account{connection.metadata.ad_accounts.length !== 1 ? 's' : ''}
                            {connection.metadata.ad_accounts.length > 0 && connection.metadata.ad_accounts[0].name && (
                              <span> ({connection.metadata.ad_accounts[0].name}{connection.metadata.ad_accounts.length > 1 ? `, +${connection.metadata.ad_accounts.length - 1} more` : ''})</span>
                            )}
                          </p>
                        </div>
                      )}
                      {connection.metadata.businesses && connection.metadata.businesses.length > 0 && (
                        <div className="metadata-item">
                          <p className="metadata-label">Businesses:</p>
                          <p className="metadata-value">
                            {connection.metadata.businesses.length} business{connection.metadata.businesses.length !== 1 ? 'es' : ''}
                          </p>
                        </div>
                      )}
                      {connection.metadata.pages && connection.metadata.pages.length > 0 && (
                        <div className="metadata-item">
                          <p className="metadata-label">Pages:</p>
                          <p className="metadata-value">
                            {connection.metadata.pages.length} page{connection.metadata.pages.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      )}
                      {connection.metadata.token_expiry && (
                        <div className="metadata-item">
                          <p className="metadata-label">Token Expires:</p>
                          <p className="metadata-value">
                            {new Date(connection.metadata.token_expiry).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })}
                          </p>
                        </div>
                      )}
                      <div className="metadata-item">
                        <p className="metadata-label">Connected since:</p>
                        <p className="metadata-value">
                          {new Date(connection.created_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Standard metadata for other services */}
                {connection.service_name !== 'github' && connection.service_name !== 'gmail' && connection.service_name !== 'instagram' && connection.service_name !== 'meta-ads' && connection.metadata && (
                  <div className="connection-metadata">
                    <p className="metadata-label">Connected since:</p>
                    <p className="metadata-value">
                      {new Date(connection.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Connections;
