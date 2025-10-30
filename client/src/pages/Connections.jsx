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
    } else if (errorParam) {
      const errorMessages = {
        'invalid_state': 'OAuth security validation failed. Please try again.',
        'no_code': 'GitHub authorization failed. Please try again.',
        'no_token': 'Failed to obtain GitHub access token.',
        'oauth_failed': 'GitHub OAuth process failed. Please try again.'
      };
      setError(errorMessages[errorParam] || 'An error occurred during GitHub connection.');
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
          conn.id === connectionId ? { ...conn, status: newStatus } : conn
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

  const getServiceIcon = (serviceName) => {
    const icons = {
      github: '🐙',
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
                <span className="service-icon">🐙</span>
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

        {!loading && !error && connections.length === 0 && !connections.find(c => c.service_name === 'github') && (
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
                    <span className="service-icon">
                      {getServiceIcon(connection.service_name)}
                    </span>
                    <div>
                      <h3>{connection.service_name}</h3>
                      <span className={`connection-status ${connection.status}`}>
                        {connection.status}
                      </span>
                    </div>
                  </div>

                  {connection.service_name === 'github' ? (
                    <button
                      className="disconnect-button"
                      onClick={() => disconnectGitHub(connection.id)}
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
                {connection.service_name !== 'github' && connection.metadata && (
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
