import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTerminal } from '../contexts/TerminalContext';
import Navbar from '../components/Navbar';
import DonationModal from '../components/DonationModal';
import './Dashboard.css';

function Dashboard() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [balance, setBalance] = useState(null);
  const [topFunders, setTopFunders] = useState([]);
  const [fundingProjects, setFundingProjects] = useState([]);
  const [isDonationModalOpen, setIsDonationModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const { token, user } = useAuth();
  const { terminalLogs } = useTerminal();

  useEffect(() => {
    fetchTasks();
    fetchBalance();
    fetchTopFunders();
    fetchFundingProjects();
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

  const fetchBalance = async () => {
    try {
      const response = await fetch('/api/balance', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (response.ok) {
        setBalance(data.balance);
      }
    } catch (err) {
      console.error('Failed to fetch balance:', err);
    }
  };

  const fetchTopFunders = async () => {
    if (!user?.id) return;
    try {
      const response = await fetch(`/api/donations/user/${user.id}/top-donors?limit=5`);
      const data = await response.json();
      if (response.ok) {
        setTopFunders(data.topDonors || []);
      }
    } catch (err) {
      console.error('Failed to fetch top funders:', err);
    }
  };

  const fetchFundingProjects = async () => {
    try {
      const response = await fetch('/api/funding-projects', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (response.ok) {
        setFundingProjects(data.projects || []);
      }
    } catch (err) {
      console.error('Failed to fetch funding projects:', err);
    }
  };

  const handleDonateClick = (project = null) => {
    setSelectedProject(project);
    setIsDonationModalOpen(true);
  };

  const handleDonationModalClose = () => {
    setIsDonationModalOpen(false);
    setSelectedProject(null);
    // Refresh data after donation
    fetchBalance();
    fetchTopFunders();
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
    <>
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

      <div className="dashboard-container">

      <div className="dashboard-content">
        {/* Metrics Summary Section - Paperclips Style */}
        <div className="paperclips-container">
          {/* Left Column */}
          <div className="paperclips-left">
            <h2 className="paperclips-title">Business</h2>

            <div className="paperclips-stat">
              All-time Users: <span className="paperclips-value">8,342</span>
            </div>
            <div className="paperclips-stat">
              Monthly Active Users: <span className="paperclips-value">1,579</span>
            </div>
            <div className="paperclips-stat">
              All-time Revenue: <span className="paperclips-value">$ 487,230</span>
            </div>
            <div className="paperclips-stat">
              Monthly Revenue: <span className="paperclips-value">$ 12,450</span>
            </div>
            <div className="paperclips-stat">
              Monthly Churn: <span className="paperclips-value">2.3%</span>
            </div>
            <div className="paperclips-stat">
              Cost per User: <span className="paperclips-value">$ 0.52</span>
            </div>

            <h2 className="paperclips-title">AI Operations</h2>

            <div className="paperclips-stat">
              Active Agents: <span className="paperclips-value">8</span>
            </div>
            <div className="paperclips-stat">
              Services Connected: <span className="paperclips-value">12</span>
            </div>
            <div className="paperclips-stat">
              Tasks Completed: <span className="paperclips-value">1,247</span>
            </div>
            <div className="paperclips-stat">
              LOC Written: <span className="paperclips-value">3,892</span>
            </div>
            <div className="paperclips-stat">
              Content Created: <span className="paperclips-value">156</span>
            </div>

          </div>

          {/* Right Column */}
          <div className="paperclips-right">
            <h2 className="paperclips-title">Computational Resources</h2>

            <div className="paperclips-section">
              <span className="paperclips-stat">Available Funds: <span className="paperclips-value">
                $ {balance ? parseFloat(balance.current_balance_usd).toFixed(2) : '0.00'}
              </span></span>
              <button className="paperclips-btn" onClick={() => handleDonateClick()}>Add Funds</button>
            </div>

            <div className="paperclips-stat" style={{marginTop: '15px'}}>
              Funders: <span className="paperclips-value">{topFunders.length}</span>
            </div>

            <h2 className="paperclips-title">Top Funders</h2>

            {topFunders.length > 0 ? (
              <>
                {topFunders.map((funder, index) => (
                  <div key={index} className="paperclips-stat">
                    {index + 1}. <span className="paperclips-value">
                      {funder.donor_name} - $ {parseFloat(funder.total_donated).toFixed(2)}
                    </span>
                  </div>
                ))}
                <div className="paperclips-section" style={{marginTop: '10px'}}>
                  <button className="paperclips-btn">Show All</button>
                </div>
              </>
            ) : (
              <div className="paperclips-stat" style={{fontStyle: 'italic', color: '#666'}}>
                No funders yet
              </div>
            )}

            <h2 className="paperclips-title" style={{marginTop: '30px'}}>Funding Projects</h2>

            {fundingProjects.length > 0 ? (
              fundingProjects.map((project) => (
                <div key={project.id} className="paperclips-project">
                  <div className="paperclips-project-title">
                    <strong>{project.name}</strong> (${parseFloat(project.goal_amount_usd).toFixed(0)})
                  </div>
                  <div className="paperclips-project-desc">
                    {project.description}
                  </div>
                </div>
              ))
            ) : (
              <div className="paperclips-stat" style={{fontStyle: 'italic', color: '#666'}}>
                No funding projects yet
              </div>
            )}
          </div>
        </div>

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
          <>
            <h2 className="paperclips-title" style={{ marginTop: '10px', marginBottom: '15px' }}>Recent Activity</h2>
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
          </>
        )}
      </div>

        <footer className="footer">
          <p className="footer-contact">Contact: <a href="mailto:system@polsia.ai">system@polsia.ai</a></p>
        </footer>
      </div>

      <DonationModal
        isOpen={isDonationModalOpen}
        onClose={handleDonationModalClose}
        userId={user?.id}
        projectId={selectedProject?.id}
        projectName={selectedProject?.name || 'General Fund'}
        isOwnAccount={true}
      />
    </>
  );
}

export default Dashboard;
