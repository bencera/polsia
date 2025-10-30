import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Navbar from '../components/Navbar';
import './Dashboard.css';

function Dashboard() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { token } = useAuth();

  useEffect(() => {
    fetchTasks();
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

  return (
    <div className="dashboard-container">
      <div className="terminal">
        <span>&gt; Task execution log</span>
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
