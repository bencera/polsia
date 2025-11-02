import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTerminal } from '../contexts/TerminalContext';
import Navbar from '../components/Navbar';
import './Dashboard.css';

function Dashboard() {
  const [tasks, setTasks] = useState([]);
  const [brainStatus, setBrainStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { token } = useAuth();
  const { terminalLogs } = useTerminal();

  useEffect(() => {
    fetchTasks();
    fetchBrainStatus();
  }, []);

  const fetchTasks = async () => {
    try {
      const response = await fetch('/api/tasks', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setTasks(data.tasks);
      } else {
        setError(data.message || 'Failed to load tasks');
      }
    } catch (err) {
      setError('Failed to load tasks. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchBrainStatus = async () => {
    try {
      const response = await fetch('/api/brain/status', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setBrainStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch Brain status:', err);
    }
  };

  const formatTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (seconds < 60) return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`;
    if (weeks < 4) return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
    if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`;
    return `${years} year${years !== 1 ? 's' : ''} ago`;
  };

  // Format log for terminal display
  const formatLogMessage = (log) => {
    const time = new Date(log.timestamp).toLocaleTimeString();
    return `[${time}] ${log.stage ? `[${log.stage}] ` : ''}${log.message}`;
  };

  // Get last 4 logs for terminal display
  const displayLogs = terminalLogs.slice(-4);

  return (
    <div className="dashboard-container">
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

      <div className="dashboard-content">
        {loading && (
          <div className="status-message">
            <p>Loading tasks...</p>
          </div>
        )}

        {error && (
          <div className="status-message error">
            <p>{error}</p>
          </div>
        )}

        {/* Brain Status Card */}
        {brainStatus && (
          <div className="brain-status-preview">
            <div className="brain-status-header">
              <h3>🧠 Brain Status</h3>
              <a href="/brain" className="view-brain-link">View Details →</a>
            </div>
            {brainStatus.status === 'never_run' ? (
              <p className="brain-status-text">The Brain has not run yet. <a href="/brain">Trigger your first cycle →</a></p>
            ) : (
              <div className="brain-status-content">
                <p className="brain-last-run">Last run: {formatTimeAgo(brainStatus.last_decision.created_at)}</p>
                <p className="brain-last-action">
                  <strong>Action:</strong> {brainStatus.last_decision.action}
                </p>
                <p className="brain-execution-status">
                  <strong>Status:</strong>{' '}
                  <span className={`status-badge status-${brainStatus.last_decision.execution_status}`}>
                    {brainStatus.last_decision.execution_status || 'pending'}
                  </span>
                </p>
              </div>
            )}
          </div>
        )}

        {!loading && !error && tasks.length === 0 && (
          <div className="status-message">
            <p>No tasks yet. Your task history will appear here once Polsia starts working for you.</p>
          </div>
        )}

        {!loading && !error && tasks.length > 0 && (
          <div className="tasks-feed">
            {tasks.map((task) => (
              <div key={task.id} className="task-item">
                <h3 className="task-title">{task.title}</h3>

                {task.description && (
                  <p className="task-description">{task.description}</p>
                )}

                {task.services && task.services.length > 0 && (
                  <div className="task-services">
                    Services: {task.services.map((service, index) => (
                      <span key={service.id}>
                        {index > 0 && ', '}
                        {service.service_name}
                      </span>
                    ))}
                  </div>
                )}

                <div className="task-timestamp">
                  {formatTimeAgo(task.created_at)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <footer className="footer">
        <p className="footer-contact">Contact: <a href="mailto:system@polsia.ai">system@polsia.ai</a></p>
      </footer>
    </div>
  );
}

export default Dashboard;
