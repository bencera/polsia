import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { useTerminal } from '../contexts/TerminalContext';
import './Settings.css';

function Settings() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { terminalLogs } = useTerminal();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Format log for terminal display
  const formatLogMessage = (log) => {
    const time = new Date(log.timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    return `[${time}] [${log.stage || 'info'}] ${log.message}`;
  };

  // Get last 4 logs for terminal display
  const displayLogs = terminalLogs.slice(-4);

  return (
    <>
      <div className="terminal">
        {displayLogs.length === 0 ? (
          <>
            <div>&gt; System Configuration</div>
            <div>&nbsp;</div>
            <div>&nbsp;</div>
            <div>&nbsp;</div>
          </>
        ) : (
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

      <div className="settings-container">
        <div className="settings-content">
          <div className="settings-header">
            <h2>Settings</h2>
            <p className="settings-subtitle">
              Manage your connections, tools, documents, and analytics
            </p>
          </div>

        <div className="settings-sections">
          <button
            className="settings-link-button"
            onClick={() => navigate('/connections')}
          >
            Connections
          </button>

          <button
            className="settings-link-button"
            onClick={() => navigate('/tools')}
          >
            Tools
          </button>

          <button
            className="settings-link-button"
            onClick={() => navigate('/documents')}
          >
            Documents
          </button>

          <button
            className="settings-link-button"
            onClick={() => navigate('/analytics')}
          >
            Analytics
          </button>

          <button
            className="settings-link-button"
            onClick={() => navigate('/cost-tracking')}
          >
            Cost Tracking
          </button>

          <button onClick={handleLogout} className="logout-button">
            Logout
          </button>
        </div>

        <footer className="footer">
          <p className="footer-contact">Contact: <a href="mailto:system@polsia.ai">system@polsia.ai</a></p>
        </footer>
      </div>
      </div>
    </>
  );
}

export default Settings;
