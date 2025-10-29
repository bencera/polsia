import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Navbar from '../components/Navbar';
import './Settings.css';

function Settings() {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(null);
  const { token } = useAuth();

  useEffect(() => {
    fetchConnections();
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

  return (
    <div className="settings-container">
      <Navbar />

      <div className="settings-content">
        <div className="settings-header">
          <h2>Settings</h2>
          <p>Manage your service connections</p>
        </div>

        {loading && (
          <div className="loading-state">
            <p>Loading connections...</p>
          </div>
        )}

        {error && (
          <div className="error-state">
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && connections.length === 0 && (
          <div className="empty-state">
            <p>No service connections found. Contact your administrator to set up connections.</p>
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

                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={connection.status === 'connected'}
                      onChange={() => toggleConnection(connection.id, connection.status)}
                      disabled={updating === connection.id}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                {connection.metadata && (
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

export default Settings;
