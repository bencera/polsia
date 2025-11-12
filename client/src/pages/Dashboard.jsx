import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTerminal } from '../contexts/TerminalContext';
import Navbar from '../components/Navbar';
import DonationModal from '../components/DonationModal';
import './Dashboard.css';

// Countdown timer hook
function useCountdown(targetDate) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date().getTime();
      const distance = targetDate - now;

      if (distance < 0) {
        setTimeLeft('00h 00m 00s');
        return;
      }

      const hours = Math.floor(distance / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      setTimeLeft(`${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [targetDate]);

  return timeLeft;
}

function Dashboard({ isPublic = false, publicUser = null }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [balance, setBalance] = useState(null);
  const [topFunders, setTopFunders] = useState([]);
  const [fundingProjects, setFundingProjects] = useState([]);
  const [isDonationModalOpen, setIsDonationModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);

  // Use publicUser if in public mode, otherwise use authenticated user
  const { token, user: authUser } = useAuth();
  const user = isPublic ? publicUser : authUser;
  const { terminalLogs } = useTerminal();

  // CEO next decision countdown - set to a fixed target time for demo (6 hours from now)
  const [nextDecisionTime] = useState(() => {
    const now = new Date();
    return now.getTime() + (6 * 60 * 60 * 1000); // 6 hours from now
  });
  const countdown = useCountdown(nextDecisionTime);

  useEffect(() => {
    if (user?.id) {
      fetchTasks();
      fetchBalance();
      fetchTopFunders();
      fetchFundingProjects();
    }
  }, [user]);

  const fetchTasks = async () => {
    try {
      // Use public endpoint if in public mode (assuming we create /api/tasks/user/:userId endpoint)
      const url = isPublic ? `/api/tasks/user/${user.id}` : '/api/tasks';
      const headers = isPublic ? {} : { 'Authorization': `Bearer ${token}` };

      const response = await fetch(url, { headers });

      const data = await response.json();

      if (response.ok) {
        setTasks(data.tasks || []);
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
      // Use public endpoint if in public mode
      const url = isPublic ? `/api/balance/user/${user.id}` : '/api/balance';
      const headers = isPublic ? {} : { 'Authorization': `Bearer ${token}` };

      const response = await fetch(url, { headers });
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
      // Use public endpoint if in public mode
      const url = isPublic ? `/api/funding-projects/user/${user.id}` : '/api/funding-projects';
      const headers = isPublic ? {} : { 'Authorization': `Bearer ${token}` };

      const response = await fetch(url, { headers });
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

  // Get last 5 logs for terminal display
  const displayLogs = terminalLogs.slice(-5);

  return (
    <>
      <div className="terminal">
        {displayLogs.length === 0 ? (
          // Show 5 lines when idle
          <>
            <div>&gt; Autonomous Operations Control</div>
            <div>&nbsp;</div>
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
            {displayLogs.length < 5 &&
              Array.from({ length: 5 - displayLogs.length }).map((_, i) => (
                <div key={`empty-${i}`}>&nbsp;</div>
              ))
            }
          </>
        )}
      </div>

      {/* Show full Navbar with navigation buttons in private mode, simple header in public mode */}
      {isPublic ? (
        <nav className="navbar">
          <div className="navbar-brand-container">
            <span className="navbar-brand">
              {user?.company_name || 'Company'}
            </span>
            <button
              onClick={() => window.location.href = '/'}
              className="nav-button"
              style={{ marginLeft: '10px' }}
            >
              Run by Polsia
            </button>
          </div>
          <div className="navbar-actions">
          </div>
        </nav>
      ) : (
        <Navbar />
      )}

      <div className="dashboard-container">

      <div className="dashboard-content">
        {/* Metrics Summary Section - Paperclips Style */}
        <div className="paperclips-container">
          {/* Left Column */}
          <div className="paperclips-left">
            {/* 1. Business */}
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

            {/* 2. Autonomous Resources */}
            <h2 className="paperclips-title">Autonomous Resources</h2>
            <div className="paperclips-section">
              <span className="paperclips-stat">Available Funds: <span className="paperclips-value">
                $ {balance ? parseFloat(balance.current_balance_usd).toFixed(2) : '0.00'}
              </span></span>
              <button className="paperclips-btn" onClick={() => handleDonateClick()}>Add Funds</button>
            </div>
            <div className="paperclips-stat" style={{marginTop: '15px'}}>
              Funders: <span className="paperclips-value">{topFunders.length}</span>
            </div>
            {topFunders.length > 0 && (
              <>
                <div className="paperclips-stat" style={{marginTop: '5px'}}>
                  Top Funders: {topFunders.slice(0, 5).map((funder, index) => (
                    <span key={index}>
                      {index > 0 && ', '}
                      {funder.donor_name} (${parseFloat(funder.total_donated).toFixed(0)})
                    </span>
                  ))}
                </div>
                <div style={{marginTop: '8px'}}>
                  <button className="paperclips-btn">Show All</button>
                </div>
              </>
            )}

            {/* 3. Recent Activity */}
            <h2 className="paperclips-title">Recent Activity</h2>
            {loading && (
              <div className="paperclips-stat" style={{fontStyle: 'italic', color: '#666'}}>
                Loading tasks...
              </div>
            )}
            {error && (
              <div className="paperclips-stat" style={{fontStyle: 'italic', color: '#666'}}>
                {error}
              </div>
            )}
            {!loading && !error && tasks.length === 0 && (
              <div className="paperclips-stat" style={{fontStyle: 'italic', color: '#666'}}>
                No tasks yet. Your task history will appear here once Polsia starts working for you.
              </div>
            )}
            {!loading && !error && tasks.length > 0 && (
              <div className="recent-activity-scroll">
                {tasks.slice(0, 3).map((task) => (
                  <div key={task.id} className="activity-item">
                    <div className="activity-title">{task.title}</div>
                    {task.description && (
                      <div className="activity-description">{task.description}</div>
                    )}
                    <div className="activity-timestamp">{formatTimeAgo(task.created_at)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Column */}
          <div className="paperclips-right">
            {/* 4. CEO */}
            <h2 className="paperclips-title">CEO</h2>
            <div className="paperclips-stat">
              Decisions Made: <span className="paperclips-value">42</span>
            </div>
            <div className="paperclips-stat">
              Tasks Delegated: <span className="paperclips-value">156</span>
            </div>
            <div className="paperclips-section" style={{marginTop: '10px'}}>
              <span className="paperclips-stat">Next Decision: <span className="paperclips-value">{countdown}</span></span>
              <button className="paperclips-btn">Make Decision Now</button>
            </div>

            {/* Engineering */}
            <h2 className="paperclips-title">Engineering</h2>
            <div className="paperclips-project">
              <div className="paperclips-project-title">
                <strong>Fix authentication bug</strong> ($12)
              </div>
              <div className="paperclips-project-desc">
                Users unable to login with GitHub OAuth. Investigate token refresh issue.
              </div>
            </div>
            <div className="paperclips-project">
              <div className="paperclips-project-title">
                <strong>Optimize database queries</strong> ($25)
              </div>
              <div className="paperclips-project-desc">
                Slow loading times on dashboard. Add indexes to agents and executions tables.
              </div>
            </div>
            <div className="paperclips-project">
              <div className="paperclips-project-title">
                <strong>Implement caching layer</strong> ($45)
              </div>
              <div className="paperclips-project-desc">
                Add Redis caching for API responses to reduce database load by 60%.
              </div>
            </div>

            {/* Marketing */}
            <h2 className="paperclips-title">Marketing</h2>
            <div className="paperclips-project">
              <div className="paperclips-project-title">
                <strong>Launch product announcement</strong> ($18)
              </div>
              <div className="paperclips-project-desc">
                Create and schedule social media posts for new agent marketplace launch.
              </div>
            </div>
            <div className="paperclips-project">
              <div className="paperclips-project-title">
                <strong>Write blog post</strong> ($22)
              </div>
              <div className="paperclips-project-desc">
                Technical deep-dive on autonomous agents. Target: 2,000 words with code examples.
              </div>
            </div>
            <div className="paperclips-project">
              <div className="paperclips-project-title">
                <strong>Generate Instagram content</strong> ($15)
              </div>
              <div className="paperclips-project-desc">
                Create 10 engaging posts with AI-generated images for next week's schedule.
              </div>
            </div>

            {/* 5. Operations */}
            <h2 className="paperclips-title" style={{marginTop: '30px'}}>Operations</h2>
            <div className="paperclips-project">
              <div className="paperclips-project-title">
                <strong>Automate customer onboarding</strong> ($30)
              </div>
              <div className="paperclips-project-desc">
                Build workflow to send welcome emails, create accounts, and schedule check-ins.
              </div>
            </div>
            <div className="paperclips-project">
              <div className="paperclips-project-title">
                <strong>Invoice processing automation</strong> ($28)
              </div>
              <div className="paperclips-project-desc">
                Extract data from PDFs, validate against POs, and update accounting system.
              </div>
            </div>
            <div className="paperclips-project">
              <div className="paperclips-project-title">
                <strong>Daily metrics report</strong> ($8)
              </div>
              <div className="paperclips-project-desc">
                Generate and email summary of key business metrics every morning at 8am.
              </div>
            </div>
          </div>
        </div>
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
        projectName={selectedProject?.name || user?.company_name || 'Your Account'}
        isOwnAccount={true}
      />
    </>
  );
}

export default Dashboard;
