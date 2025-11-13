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
  const [connections, setConnections] = useState([]);
  const [documents, setDocuments] = useState(null);
  const [reports, setReports] = useState([]);
  const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [isPolsiaModalOpen, setIsPolsiaModalOpen] = useState(false);
  const [isFundersModalOpen, setIsFundersModalOpen] = useState(false);
  const [allFunders, setAllFunders] = useState([]);
  const [isAutoFundModalOpen, setIsAutoFundModalOpen] = useState(false);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [isConnectionsModalOpen, setIsConnectionsModalOpen] = useState(false);
  const [allActivity, setAllActivity] = useState([]);
  const [activityPage, setActivityPage] = useState(1);
  const [hasMoreActivity, setHasMoreActivity] = useState(true);
  const [loadingMoreActivity, setLoadingMoreActivity] = useState(false);
  const [isAllDocumentsModalOpen, setIsAllDocumentsModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isTasksModalOpen, setIsTasksModalOpen] = useState(false);
  const [isAgentsModalOpen, setIsAgentsModalOpen] = useState(false);
  const [isToolsModalOpen, setIsToolsModalOpen] = useState(false);
  const [isDocumentsModalOpen, setIsDocumentsModalOpen] = useState(false);
  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false);
  const [isCostTrackingModalOpen, setIsCostTrackingModalOpen] = useState(false);
  const [isAdvancedSettingsModalOpen, setIsAdvancedSettingsModalOpen] = useState(false);

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
      fetchDocuments();
      fetchReports();
      if (!isPublic) {
        fetchConnections();
      }
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

  const fetchAllFunders = async () => {
    if (!user?.id) return;
    try {
      const response = await fetch(`/api/donations/user/${user.id}/top-donors`);
      const data = await response.json();
      if (response.ok) {
        setAllFunders(data.topDonors || []);
        setIsFundersModalOpen(true);
      }
    } catch (err) {
      console.error('Failed to fetch all funders:', err);
    }
  };

  const fetchAllActivity = async (page = 1) => {
    if (!user?.id) return;
    try {
      const limit = 10;
      const response = await fetch(`/api/tasks?limit=${limit}&offset=${(page - 1) * limit}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (response.ok) {
        const newTasks = data.tasks || [];
        if (page === 1) {
          setAllActivity(newTasks);
          setIsActivityModalOpen(true);
        } else {
          setAllActivity(prev => [...prev, ...newTasks]);
        }
        setHasMoreActivity(newTasks.length === limit);
        setActivityPage(page);
      }
    } catch (err) {
      console.error('Failed to fetch all activity:', err);
    } finally {
      setLoadingMoreActivity(false);
    }
  };

  const loadMoreActivity = () => {
    setLoadingMoreActivity(true);
    fetchAllActivity(activityPage + 1);
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

  const fetchConnections = async () => {
    try {
      const response = await fetch('/api/connections', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (response.ok) {
        setConnections(data.connections || []);
      }
    } catch (err) {
      console.error('Failed to fetch connections:', err);
    }
  };

  const fetchDocuments = async () => {
    try {
      const url = isPublic ? `/api/documents/user/${user.id}` : '/api/documents';
      const headers = isPublic ? {} : { 'Authorization': `Bearer ${token}` };

      const response = await fetch(url, { headers });
      const data = await response.json();
      if (response.ok) {
        setDocuments(data.documents);
      }
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    }
  };

  const fetchReports = async () => {
    try {
      const url = isPublic ? `/api/reports/user/${user.id}?limit=5` : '/api/reports?limit=5';
      const headers = isPublic ? {} : { 'Authorization': `Bearer ${token}` };

      const response = await fetch(url, { headers });
      const data = await response.json();
      if (response.ok) {
        setReports(data.reports || []);
      }
    } catch (err) {
      console.error('Failed to fetch reports:', err);
    }
  };

  // Connection functions
  const connectGitHub = () => {
    const isProduction = window.location.hostname !== 'localhost';
    const backendUrl = isProduction ? window.location.origin : (import.meta.env.VITE_API_URL || 'http://localhost:3000');
    window.location.href = `${backendUrl}/api/auth/github?token=${token}`;
  };

  const connectGmail = () => {
    const isProduction = window.location.hostname !== 'localhost';
    const backendUrl = isProduction ? window.location.origin : (import.meta.env.VITE_API_URL || 'http://localhost:3000');
    window.location.href = `${backendUrl}/api/auth/gmail?token=${token}`;
  };

  const connectSlack = () => {
    const isProduction = window.location.hostname !== 'localhost';
    const backendUrl = isProduction ? window.location.origin : (import.meta.env.VITE_API_URL || 'http://localhost:3000');
    window.location.href = `${backendUrl}/api/auth/slack?token=${token}`;
  };

  const connectInstagram = () => {
    const isProduction = window.location.hostname !== 'localhost';
    const backendUrl = isProduction ? window.location.origin : (import.meta.env.VITE_API_URL || 'http://localhost:3000');
    window.location.href = `${backendUrl}/api/auth/instagram?token=${token}`;
  };

  const connectMetaAds = () => {
    const isProduction = window.location.hostname !== 'localhost';
    const backendUrl = isProduction ? window.location.origin : (import.meta.env.VITE_API_URL || 'http://localhost:3000');
    window.location.href = `${backendUrl}/api/auth/meta-ads?token=${token}`;
  };

  const connectSentry = () => {
    const isProduction = window.location.hostname !== 'localhost';
    const backendUrl = isProduction ? window.location.origin : (import.meta.env.VITE_API_URL || 'http://localhost:3000');
    window.location.href = `${backendUrl}/api/auth/sentry?token=${token}`;
  };

  const disconnectService = async (serviceName, connectionId) => {
    if (!confirm(`Are you sure you want to disconnect your ${serviceName.charAt(0).toUpperCase() + serviceName.slice(1)} account?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/auth/${serviceName}/${connectionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setConnections(connections.filter(conn => conn.id !== connectionId));
        alert(`${serviceName.charAt(0).toUpperCase() + serviceName.slice(1)} account disconnected successfully!`);
      } else {
        alert(data.error || `Failed to disconnect ${serviceName}`);
      }
    } catch (err) {
      alert(`Failed to disconnect ${serviceName}. Please try again.`);
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

  const handleDocumentClick = (docType, content) => {
    setSelectedDocument({ type: docType, content });
    setIsDocumentModalOpen(true);
  };

  const handleDocumentModalClose = () => {
    setIsDocumentModalOpen(false);
    setSelectedDocument(null);
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
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsPolsiaModalOpen(true);
              }}
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
        <Navbar isPublic={false} />
      )}

      <div className="dashboard-content">
        {/* Metrics Summary Section */}
        <div className="dashboard-container">
          {/* Left Column */}
          <div className="dashboard-left">
            {/* 1. Business */}
            <h2 className="dashboard-title">Business</h2>
            <div className="dashboard-stat">
              All-time Users: <span className="dashboard-value">8,342</span>
            </div>
            <div className="dashboard-stat">
              Monthly Active Users: <span className="dashboard-value">1,579</span>
            </div>
            <div className="dashboard-stat">
              All-time Revenue: <span className="dashboard-value">$487,230</span>
            </div>
            <div className="dashboard-stat">
              Monthly Revenue: <span className="dashboard-value">$12,450</span>
            </div>
            <div className="dashboard-stat">
              Monthly Churn: <span className="dashboard-value">2.3%</span>
            </div>
            <div className="dashboard-stat">
              Cost per User: <span className="dashboard-value">$0.52</span>
            </div>
            <div style={{marginTop: '10px'}}>
              <button className="dashboard-btn">Refresh</button>
            </div>

            {/* 2. Autonomous Resources */}
            <h2 className="dashboard-title">Autonomous Resources</h2>
            <div className="dashboard-section">
              <span className="dashboard-stat">Operations: <span className="dashboard-value">
                {balance ? Math.round(parseFloat(balance.current_balance_usd) * 100) : '0'}
              </span></span>
              <button className="dashboard-btn" onClick={() => handleDonateClick()}>Add Ops</button>
            </div>
            <div className="dashboard-section" style={{marginTop: '10px'}}>
              <span className="dashboard-stat">Auto-refill: <span className="dashboard-value">OFF</span></span>
              <button className="dashboard-btn" onClick={() => setIsAutoFundModalOpen(true)}>Enable</button>
            </div>
            <div className="dashboard-section" style={{marginTop: '10px'}}>
              <span className="dashboard-stat">Model:</span>
              <select
                className="model-selector"
                style={{
                  padding: '4px 8px',
                  border: '1px solid #1a1a1a',
                  borderRadius: '2px',
                  fontFamily: 'Arial, Helvetica, sans-serif',
                  fontSize: '12px',
                  cursor: 'pointer',
                  backgroundColor: '#fff'
                }}
              >
                <option value="claude-sonnet-4-5-20250929">claude-sonnet-4-5-20250929</option>
              </select>
            </div>
            <div className="dashboard-stat" style={{marginTop: '15px'}}>
              Contributors: <span className="dashboard-value">{topFunders.length}</span>
            </div>
            {topFunders.length > 0 && (
              <>
                <div className="dashboard-stat" style={{marginTop: '5px'}}>
                  Top Contributors: {topFunders.slice(0, 5).map((funder, index) => (
                    <span key={index}>
                      {index > 0 && ', '}
                      {funder.donor_name} ({Math.round(parseFloat(funder.total_donated) * 100)} ops)
                    </span>
                  ))}
                </div>
                <div style={{marginTop: '8px'}}>
                  <a
                    onClick={fetchAllFunders}
                    style={{
                      color: '#000',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontFamily: 'Times New Roman, Times, serif'
                    }}
                  >
                    View all →
                  </a>
                </div>
              </>
            )}

            {/* 3. Recent Activity */}
            <h2 className="dashboard-title">Recent Activity</h2>
            {loading && (
              <div className="dashboard-stat" style={{fontStyle: 'italic', color: '#666'}}>
                Loading tasks...
              </div>
            )}
            {error && (
              <div className="dashboard-stat" style={{fontStyle: 'italic', color: '#666'}}>
                {error}
              </div>
            )}
            {!loading && !error && tasks.length === 0 && (
              <div className="dashboard-stat" style={{fontStyle: 'italic', color: '#666'}}>
                No tasks yet. Your task history will appear here once Polsia starts working for you.
              </div>
            )}
            {!loading && !error && tasks.length > 0 && (
              <>
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
                <div style={{marginTop: '10px'}}>
                  <a
                    onClick={() => fetchAllActivity(1)}
                    style={{
                      color: '#000',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontFamily: 'Times New Roman, Times, serif'
                    }}
                  >
                    View all →
                  </a>
                </div>
              </>
            )}
          </div>

          {/* Middle Column */}
          <div className="dashboard-middle">
            {/* 4. CEO */}
            <h2 className="dashboard-title">CEO</h2>
            <div className="dashboard-stat">
              Decisions Made: <span className="dashboard-value">42</span>
            </div>
            <div className="dashboard-section" style={{marginTop: '10px'}}>
              <span className="dashboard-stat">Next Decision: <span className="dashboard-value">{countdown}</span></span>
              <button className="dashboard-btn">Make Decision Now</button>
            </div>

            {/* Recent Decisions */}
            <div style={{marginTop: '15px'}}>
              <div className="dashboard-stat" style={{marginBottom: '10px'}}>
                Recent Decisions
              </div>
              <div className="recent-activity-scroll" style={{marginTop: '10px'}}>
                <div className="activity-item">
                  <div className="activity-description" style={{color: '#000'}}>
                    Reallocated $20 from ads to analytics due to rising CPI (+12%).
                  </div>
                  <div className="activity-timestamp">2 hours ago</div>
                </div>
                <div className="activity-item">
                  <div className="activity-description" style={{color: '#000'}}>
                    Paused feature rollout after 2 error spikes.
                  </div>
                  <div className="activity-timestamp">5 hours ago</div>
                </div>
                <div className="activity-item">
                  <div className="activity-description" style={{color: '#000'}}>
                    Approved blog post on agent marketplace for launch tomorrow.
                  </div>
                  <div className="activity-timestamp">1 day ago</div>
                </div>
              </div>
            </div>

            {/* Engineering Projects */}
            <h2 className="dashboard-title">Engineering Projects</h2>
            <div className="dashboard-project">
              <div className="dashboard-project-title">
                <strong>Fix authentication bug</strong> (1,200 ops)
              </div>
              <div className="dashboard-project-desc">
                Users unable to login with GitHub OAuth. Investigate token refresh issue.
              </div>
            </div>
            <div className="dashboard-project">
              <div className="dashboard-project-title">
                <strong>Optimize database queries</strong> (2,500 ops)
              </div>
              <div className="dashboard-project-desc">
                Slow loading times on dashboard. Add indexes to agents and executions tables.
              </div>
            </div>
            <div className="dashboard-project">
              <div className="dashboard-project-title">
                <strong>Implement caching layer</strong> (4,500 ops)
              </div>
              <div className="dashboard-project-desc">
                Add Redis caching for API responses to reduce database load by 60%.
              </div>
            </div>

            {/* Marketing Projects */}
            <h2 className="dashboard-title">Marketing Projects</h2>
            <div className="dashboard-project">
              <div className="dashboard-project-title">
                <strong>Launch product announcement</strong> (1,800 ops)
              </div>
              <div className="dashboard-project-desc">
                Create and schedule social media posts for new agent marketplace launch.
              </div>
            </div>
            <div className="dashboard-project">
              <div className="dashboard-project-title">
                <strong>Write blog post</strong> (2,200 ops)
              </div>
              <div className="dashboard-project-desc">
                Technical deep-dive on autonomous agents. Target: 2,000 words with code examples.
              </div>
            </div>
            <div className="dashboard-project">
              <div className="dashboard-project-title">
                <strong>Generate Instagram content</strong> (1,500 ops)
              </div>
              <div className="dashboard-project-desc">
                Create 10 engaging posts with AI-generated images for next week's schedule.
              </div>
            </div>
          </div>

          {/* Right Column - Links, Documents & Connections */}
          <div className="dashboard-right">
            {/* Links Section */}
            <h2 className="dashboard-title">Links</h2>
            <div style={{marginTop: '10px'}}>
              <div className="activity-item" style={{padding: '8px 0'}}>
                <a href="https://www.blanks.so" target="_blank" rel="noopener noreferrer" style={{color: '#000', textDecoration: 'none'}}>
                  <div className="activity-title" style={{fontSize: '13px'}}>Blanks Website</div>
                  <div className="activity-description" style={{fontSize: '12px', color: '#666'}}>https://www.blanks.so</div>
                </a>
              </div>
              <div className="activity-item" style={{padding: '8px 0'}}>
                <a href="https://apps.apple.com/us/app/blanks-ai-app-builder/id6744576554" target="_blank" rel="noopener noreferrer" style={{color: '#000', textDecoration: 'none'}}>
                  <div className="activity-title" style={{fontSize: '13px'}}>Blanks iOS App</div>
                  <div className="activity-description" style={{fontSize: '12px', color: '#666'}}>App Store</div>
                </a>
              </div>
            </div>

            {/* Documents Section */}
            <h2 className="dashboard-title">Documents</h2>
            {documents ? (
              <>
                <div style={{marginTop: '10px'}}>
                  {/* Vision Document */}
                  {documents.vision_md && documents.vision_md.trim().length > 0 ? (
                    <div
                      className="activity-item"
                      style={{cursor: 'pointer', padding: '8px 0'}}
                      onClick={() => handleDocumentClick('Vision', documents.vision_md)}
                    >
                      <div className="activity-title" style={{fontSize: '13px'}}>Vision</div>
                      <div className="activity-description" style={{fontSize: '12px'}}>Strategic vision document</div>
                    </div>
                  ) : (
                    <div className="activity-item" style={{cursor: 'pointer', padding: '8px 0'}} onClick={() => setIsDocumentsModalOpen(true)}>
                      <div className="activity-title" style={{fontSize: '13px'}}>Vision</div>
                      <div className="activity-description" style={{color: '#999', fontSize: '12px'}}>Not set - click to define</div>
                    </div>
                  )}

                  {/* Goals Document */}
                  {documents.goals_md && documents.goals_md.trim().length > 0 ? (
                    <div
                      className="activity-item"
                      style={{cursor: 'pointer', padding: '8px 0'}}
                      onClick={() => handleDocumentClick('Goals', documents.goals_md)}
                    >
                      <div className="activity-title" style={{fontSize: '13px'}}>Goals</div>
                      <div className="activity-description" style={{fontSize: '12px'}}>Company goals and objectives</div>
                    </div>
                  ) : (
                    <div className="activity-item" style={{cursor: 'pointer', padding: '8px 0'}} onClick={() => setIsDocumentsModalOpen(true)}>
                      <div className="activity-title" style={{fontSize: '13px'}}>Goals</div>
                      <div className="activity-description" style={{color: '#999', fontSize: '12px'}}>Not set - click to define</div>
                    </div>
                  )}

                  {/* Recent Reports (3 most recent) */}
                  {reports.slice(0, 3).map((report) => (
                    <div
                      key={report.id}
                      className="activity-item"
                      style={{cursor: 'pointer', padding: '8px 0'}}
                      onClick={() => handleDocumentClick(report.name, report.content)}
                    >
                      <div className="activity-title" style={{fontSize: '13px'}}>{report.name}</div>
                      <div className="activity-description" style={{fontSize: '12px'}}>
                        {report.report_type} • {new Date(report.report_date).toLocaleDateString()}
                      </div>
                      <div className="activity-timestamp" style={{fontSize: '11px'}}>{formatTimeAgo(report.created_at)}</div>
                    </div>
                  ))}
                </div>

                {/* View All Link */}
                <div style={{marginTop: '10px'}}>
                  <a
                    onClick={() => setIsAllDocumentsModalOpen(true)}
                    style={{
                      color: '#000',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontFamily: 'Times New Roman, Times, serif'
                    }}
                  >
                    View all →
                  </a>
                </div>
              </>
            ) : (
              <div className="dashboard-stat" style={{fontStyle: 'italic', color: '#666'}}>
                Loading documents...
              </div>
            )}

            {/* Connections Section - Only show in private mode */}
            {!isPublic && (
              <>
                <h2 className="dashboard-title">Connections</h2>
                {connections.filter(c => c.status === 'connected').length === 0 ? (
                  <div className="dashboard-stat" style={{fontStyle: 'italic', color: '#666'}}>
                    No connections yet. Connect your accounts in Settings.
                  </div>
                ) : (
                  <>
                    {connections
                      .filter(connection => connection.status === 'connected')
                      .map((connection) => (
                        <div key={connection.id} className="dashboard-stat" style={{margin: '2px 0'}}>
                          {connection.service_name.charAt(0).toUpperCase() + connection.service_name.slice(1)}:
                          <span className="dashboard-value"> Connected</span>
                        </div>
                      ))}
                    <div style={{marginTop: '10px'}}>
                      <a
                        onClick={() => setIsConnectionsModalOpen(true)}
                        style={{
                          color: '#000',
                          textDecoration: 'underline',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontFamily: 'Times New Roman, Times, serif'
                        }}
                      >
                        View all →
                      </a>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <footer className="footer">
        <p className="footer-contact">Contact: <a href="mailto:system@polsia.com">system@polsia.com</a></p>
      </footer>

      <DonationModal
        isOpen={isDonationModalOpen}
        onClose={handleDonationModalClose}
        userId={user?.id}
        projectId={selectedProject?.id}
        projectName={selectedProject?.name || user?.company_name || 'Your Account'}
        isOwnAccount={true}
      />

      {/* Document Viewer Modal */}
      {isDocumentModalOpen && selectedDocument && (
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
          onClick={handleDocumentModalClose}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '4px',
              maxWidth: '800px',
              width: '100%',
              maxHeight: '80vh',
              border: '1px solid #000',
              position: 'relative',
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
              padding: '30px 30px 20px 30px',
              borderBottom: '1px solid #ddd',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{ margin: 0, fontFamily: 'Times New Roman, Times, serif' }}>{selectedDocument.type}</h2>
              <button
                onClick={handleDocumentModalClose}
                className="dashboard-btn"
              >
                Close
              </button>
            </div>
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '20px 30px 30px 30px',
                fontFamily: 'Times New Roman, Times, serif',
                fontSize: '14px',
                lineHeight: '1.6',
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word'
              }}
            >
              {selectedDocument.content}
            </div>
          </div>
        </div>
      )}

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
              backgroundColor: '#fff',
              padding: '40px',
              borderRadius: '4px',
              maxWidth: '700px',
              width: '100%',
              maxHeight: '80vh',
              overflow: 'auto',
              border: '1px solid #000',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
              <div>
                <h1 style={{ margin: 0, fontFamily: 'Times New Roman, Times, serif', fontSize: '2.5em' }}>Polsia</h1>
                <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#666', fontFamily: 'Arial, Helvetica, sans-serif' }}>v0.431</p>
              </div>
              <button
                onClick={() => setIsPolsiaModalOpen(false)}
                className="dashboard-btn"
              >
                Close
              </button>
            </div>
            <div
              style={{
                fontFamily: 'Times New Roman, Times, serif',
                fontSize: '16px',
                lineHeight: '1.6'
              }}
            >
              <p style={{ fontSize: '1.3em', fontWeight: 'bold', marginBottom: '20px' }}>
                AI That Runs Your Company While You Sleep.
              </p>
              <p style={{ marginBottom: '20px' }}>
                Polsia thinks, builds, and markets your projects autonomously. It plans, codes, and promotes your ideas continuously — operating 24/7, adapting to data, and improving itself without human intervention.
              </p>
              <p style={{ marginBottom: '20px', fontStyle: 'italic', color: '#666' }}>
                Warning: System operates independently. Human oversight recommended.
              </p>

              {/* Only show waitlist form on public dashboard */}
              {isPublic && (
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const email = e.target.email.value;
                  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    window.location.href = `https://form.typeform.com/to/W4lyrtBc#email=${encodeURIComponent(email)}&variant=autonomous`;
                  }
                }} style={{ marginTop: '30px', marginBottom: '30px' }}>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <input
                      type="email"
                      name="email"
                      placeholder="your@email.com"
                      required
                      style={{
                        flex: '1',
                        minWidth: '200px',
                        padding: '8px 12px',
                        border: '1px solid #000',
                        borderRadius: '2px',
                        fontFamily: 'Arial, Helvetica, sans-serif',
                        fontSize: '14px'
                      }}
                    />
                    <button
                      type="submit"
                      className="dashboard-btn"
                      style={{ padding: '8px 16px', minWidth: '120px' }}
                    >
                      Join Waitlist
                    </button>
                  </div>
                </form>
              )}

              <p style={{ marginTop: '20px', fontSize: '14px', color: '#666' }}>
                Contact: <a href="mailto:system@polsia.com" style={{ color: '#000', textDecoration: 'underline' }}>system@polsia.com</a>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* All Funders Modal */}
      {isFundersModalOpen && (
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
          onClick={() => setIsFundersModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              padding: '30px',
              borderRadius: '4px',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '80vh',
              overflow: 'auto',
              border: '1px solid #000',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontFamily: 'Times New Roman, Times, serif' }}>All Contributors</h2>
              <button
                onClick={() => setIsFundersModalOpen(false)}
                className="dashboard-btn"
              >
                Close
              </button>
            </div>
            <div style={{ fontFamily: 'Times New Roman, Times, serif', fontSize: '14px' }}>
              {allFunders.length === 0 ? (
                <p style={{ color: '#666', fontStyle: 'italic' }}>No contributors yet.</p>
              ) : (
                <div>
                  {allFunders.map((funder, index) => (
                    <div
                      key={index}
                      style={{
                        padding: '12px 0',
                        borderBottom: index < allFunders.length - 1 ? '1px solid #ddd' : 'none',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{funder.donor_name}</div>
                        {funder.message && (
                          <div style={{ fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
                            "{funder.message}"
                          </div>
                        )}
                      </div>
                      <div style={{ fontWeight: 'bold', fontSize: '16px', marginLeft: '20px', whiteSpace: 'nowrap' }}>
                        {Math.round(parseFloat(funder.total_donated) * 100)} ops
                      </div>
                    </div>
                  ))}
                  <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '2px solid #000', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                    <span>Total:</span>
                    <span>{Math.round(allFunders.reduce((sum, funder) => sum + parseFloat(funder.total_donated), 0) * 100)} ops</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Auto-fund Modal */}
      {isAutoFundModalOpen && (
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
          onClick={() => setIsAutoFundModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              padding: '40px',
              borderRadius: '4px',
              maxWidth: '500px',
              width: '100%',
              border: '1px solid #000',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
              <h2 style={{ margin: 0, fontFamily: 'Times New Roman, Times, serif' }}>Automated Top-ups</h2>
              <button
                onClick={() => setIsAutoFundModalOpen(false)}
                className="dashboard-btn"
              >
                Close
              </button>
            </div>
            <div style={{ fontFamily: 'Times New Roman, Times, serif', fontSize: '14px', lineHeight: '1.6' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '20px', padding: '15px', backgroundColor: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px' }}>
                <span style={{ fontSize: '20px', marginRight: '10px', color: '#856404' }}>⚠</span>
                <p style={{ margin: 0, color: '#856404' }}>
                  You need to add a payment method before setting up automated top-ups.
                </p>
              </div>
              <p style={{ marginBottom: '20px' }}>
                Auto-fund automatically adds funds to your account when your balance falls below a specified threshold. This ensures your autonomous operations never stop running.
              </p>
              <div style={{ marginTop: '30px', textAlign: 'center' }}>
                <button
                  onClick={() => {
                    setIsAutoFundModalOpen(false);
                    setIsSettingsModalOpen(true);
                  }}
                  className="dashboard-btn"
                  style={{ padding: '10px 20px', fontSize: '14px' }}
                >
                  Add Payment Method
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* All Activity Modal */}
      {isActivityModalOpen && (
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
          onClick={() => setIsActivityModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '4px',
              maxWidth: '700px',
              width: '100%',
              maxHeight: '80vh',
              overflow: 'hidden',
              border: '1px solid #000',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '30px 30px 20px 30px',
              borderBottom: '1px solid #ddd',
              backgroundColor: '#fff',
              position: 'sticky',
              top: 0,
              zIndex: 1
            }}>
              <h2 style={{ margin: 0, fontFamily: 'Times New Roman, Times, serif' }}>Recent Activity</h2>
              <button
                onClick={() => setIsActivityModalOpen(false)}
                className="dashboard-btn"
              >
                Close
              </button>
            </div>
            <div style={{
              fontFamily: 'Times New Roman, Times, serif',
              fontSize: '14px',
              padding: '30px',
              overflowY: 'auto',
              flex: 1
            }}>
              {allActivity.length === 0 ? (
                <p style={{ color: '#666', fontStyle: 'italic' }}>No activity yet.</p>
              ) : (
                <>
                  {allActivity.map((task) => (
                    <div
                      key={task.id}
                      style={{
                        padding: '15px 0',
                        borderBottom: '1px solid #ddd'
                      }}
                    >
                      <div style={{ fontWeight: 'bold', marginBottom: '5px', fontSize: '15px' }}>{task.title}</div>
                      {task.description && (
                        <div style={{ fontSize: '13px', color: '#666', marginBottom: '5px' }}>
                          {task.description}
                        </div>
                      )}
                      <div style={{ fontSize: '12px', color: '#999' }}>{formatTimeAgo(task.created_at)}</div>
                    </div>
                  ))}
                  {hasMoreActivity && (
                    <div style={{ marginTop: '20px', textAlign: 'center' }}>
                      <button
                        onClick={loadMoreActivity}
                        className="dashboard-btn"
                        disabled={loadingMoreActivity}
                      >
                        {loadingMoreActivity ? 'Loading...' : 'Load More'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* All Documents Modal */}
      {isAllDocumentsModalOpen && (
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
          onClick={() => setIsAllDocumentsModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '4px',
              maxWidth: '700px',
              width: '100%',
              maxHeight: '80vh',
              overflow: 'hidden',
              border: '1px solid #000',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '30px 30px 20px 30px',
              borderBottom: '1px solid #ddd',
              backgroundColor: '#fff',
              position: 'sticky',
              top: 0,
              zIndex: 1
            }}>
              <h2 style={{ margin: 0, fontFamily: 'Times New Roman, Times, serif' }}>All Documents</h2>
              <button
                onClick={() => setIsAllDocumentsModalOpen(false)}
                className="dashboard-btn"
              >
                Close
              </button>
            </div>
            <div style={{
              fontFamily: 'Times New Roman, Times, serif',
              fontSize: '14px',
              padding: '30px',
              overflowY: 'auto',
              flex: 1
            }}>
              {!documents ? (
                <p style={{ color: '#666', fontStyle: 'italic' }}>Loading documents...</p>
              ) : (
                <>
                  {/* Vision Document */}
                  {documents.vision_md && documents.vision_md.trim().length > 0 && (
                    <div
                      style={{
                        padding: '15px 0',
                        borderBottom: '1px solid #ddd',
                        cursor: 'pointer'
                      }}
                      onClick={() => {
                        handleDocumentClick('Vision', documents.vision_md);
                        setIsAllDocumentsModalOpen(false);
                      }}
                    >
                      <div style={{ fontWeight: 'bold', marginBottom: '5px', fontSize: '15px' }}>Vision</div>
                      <div style={{ fontSize: '13px', color: '#666' }}>Strategic vision document</div>
                    </div>
                  )}

                  {/* Goals Document */}
                  {documents.goals_md && documents.goals_md.trim().length > 0 && (
                    <div
                      style={{
                        padding: '15px 0',
                        borderBottom: '1px solid #ddd',
                        cursor: 'pointer'
                      }}
                      onClick={() => {
                        handleDocumentClick('Goals', documents.goals_md);
                        setIsAllDocumentsModalOpen(false);
                      }}
                    >
                      <div style={{ fontWeight: 'bold', marginBottom: '5px', fontSize: '15px' }}>Goals</div>
                      <div style={{ fontSize: '13px', color: '#666' }}>Company goals and objectives</div>
                    </div>
                  )}

                  {/* All Reports */}
                  {reports.length > 0 ? (
                    <>
                      <div style={{ marginTop: '20px', marginBottom: '10px', fontWeight: 'bold', fontSize: '16px' }}>
                        Reports
                      </div>
                      {reports.map((report) => (
                        <div
                          key={report.id}
                          style={{
                            padding: '15px 0',
                            borderBottom: '1px solid #ddd',
                            cursor: 'pointer'
                          }}
                          onClick={() => {
                            handleDocumentClick(report.name, report.content);
                            setIsAllDocumentsModalOpen(false);
                          }}
                        >
                          <div style={{ fontWeight: 'bold', marginBottom: '5px', fontSize: '15px' }}>{report.name}</div>
                          <div style={{ fontSize: '13px', color: '#666', marginBottom: '5px' }}>
                            {report.report_type} • {new Date(report.report_date).toLocaleDateString()}
                          </div>
                          <div style={{ fontSize: '12px', color: '#999' }}>{formatTimeAgo(report.created_at)}</div>
                        </div>
                      ))}
                    </>
                  ) : null}

                  {(!documents.vision_md || documents.vision_md.trim().length === 0) &&
                   (!documents.goals_md || documents.goals_md.trim().length === 0) &&
                   reports.length === 0 && (
                    <p style={{ color: '#666', fontStyle: 'italic' }}>No documents or reports yet.</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Connections Modal */}
      {isConnectionsModalOpen && (
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
          onClick={() => setIsConnectionsModalOpen(false)}
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
              <h2 style={{ margin: 0, fontFamily: 'Times New Roman, Times, serif' }}>Connections</h2>
              <button
                onClick={() => setIsConnectionsModalOpen(false)}
                className="dashboard-btn"
              >
                Close
              </button>
            </div>
            <iframe
              src="/connections?embedded=true"
              style={{
                flex: 1,
                border: 'none',
                width: '100%',
                height: '100%'
              }}
              title="Connections"
            />
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
                className="dashboard-btn"
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

      {/* Tasks Modal */}
      {isTasksModalOpen && (
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
          onClick={() => setIsTasksModalOpen(false)}
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
              <h2 style={{ margin: 0, fontFamily: 'Times New Roman, Times, serif' }}>Tasks</h2>
              <button
                onClick={() => setIsTasksModalOpen(false)}
                className="dashboard-btn"
              >
                Close
              </button>
            </div>
            <iframe
              src="/tasks?embedded=true"
              style={{
                flex: 1,
                border: 'none',
                width: '100%',
                height: '100%'
              }}
              title="Tasks"
            />
          </div>
        </div>
      )}

      {/* Agents Modal */}
      {isAgentsModalOpen && (
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
          onClick={() => setIsAgentsModalOpen(false)}
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
              <h2 style={{ margin: 0, fontFamily: 'Times New Roman, Times, serif' }}>Agents</h2>
              <button
                onClick={() => setIsAgentsModalOpen(false)}
                className="dashboard-btn"
              >
                Close
              </button>
            </div>
            <iframe
              src="/agents?embedded=true"
              style={{
                flex: 1,
                border: 'none',
                width: '100%',
                height: '100%'
              }}
              title="Agents"
            />
          </div>
        </div>
      )}

      {/* Tools Modal */}
      {isToolsModalOpen && (
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
          onClick={() => setIsToolsModalOpen(false)}
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
              <h2 style={{ margin: 0, fontFamily: 'Times New Roman, Times, serif' }}>Tools</h2>
              <button
                onClick={() => setIsToolsModalOpen(false)}
                className="dashboard-btn"
              >
                Close
              </button>
            </div>
            <iframe
              src="/tools?embedded=true"
              style={{
                flex: 1,
                border: 'none',
                width: '100%',
                height: '100%'
              }}
              title="Tools"
            />
          </div>
        </div>
      )}

      {/* Documents Modal */}
      {isDocumentsModalOpen && (
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
          onClick={() => setIsDocumentsModalOpen(false)}
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
              <h2 style={{ margin: 0, fontFamily: 'Times New Roman, Times, serif' }}>Documents</h2>
              <button
                onClick={() => setIsDocumentsModalOpen(false)}
                className="dashboard-btn"
              >
                Close
              </button>
            </div>
            <iframe
              src="/documents?embedded=true"
              style={{
                flex: 1,
                border: 'none',
                width: '100%',
                height: '100%'
              }}
              title="Documents"
            />
          </div>
        </div>
      )}

      {/* Analytics Modal */}
      {isAnalyticsModalOpen && (
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
          onClick={() => setIsAnalyticsModalOpen(false)}
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
              <h2 style={{ margin: 0, fontFamily: 'Times New Roman, Times, serif' }}>Analytics</h2>
              <button
                onClick={() => setIsAnalyticsModalOpen(false)}
                className="dashboard-btn"
              >
                Close
              </button>
            </div>
            <iframe
              src="/analytics?embedded=true"
              style={{
                flex: 1,
                border: 'none',
                width: '100%',
                height: '100%'
              }}
              title="Analytics"
            />
          </div>
        </div>
      )}

      {/* Cost Tracking Modal */}
      {isCostTrackingModalOpen && (
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
          onClick={() => setIsCostTrackingModalOpen(false)}
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
              <h2 style={{ margin: 0, fontFamily: 'Times New Roman, Times, serif' }}>Cost Tracking</h2>
              <button
                onClick={() => setIsCostTrackingModalOpen(false)}
                className="dashboard-btn"
              >
                Close
              </button>
            </div>
            <iframe
              src="/cost-tracking?embedded=true"
              style={{
                flex: 1,
                border: 'none',
                width: '100%',
                height: '100%'
              }}
              title="Cost Tracking"
            />
          </div>
        </div>
      )}

      {/* Advanced Settings Modal */}
      {isAdvancedSettingsModalOpen && (
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
          onClick={() => setIsAdvancedSettingsModalOpen(false)}
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
              <h2 style={{ margin: 0, fontFamily: 'Times New Roman, Times, serif' }}>Advanced Settings</h2>
              <button
                onClick={() => setIsAdvancedSettingsModalOpen(false)}
                className="dashboard-btn"
              >
                Close
              </button>
            </div>
            <iframe
              src="/settings/advanced?embedded=true"
              style={{
                flex: 1,
                border: 'none',
                width: '100%',
                height: '100%'
              }}
              title="Advanced Settings"
            />
          </div>
        </div>
      )}
    </>
  );
}

export default Dashboard;
