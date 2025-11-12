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
              All-time Revenue: <span className="dashboard-value">$ 487,230</span>
            </div>
            <div className="dashboard-stat">
              Monthly Revenue: <span className="dashboard-value">$ 12,450</span>
            </div>
            <div className="dashboard-stat">
              Monthly Churn: <span className="dashboard-value">2.3%</span>
            </div>
            <div className="dashboard-stat">
              Cost per User: <span className="dashboard-value">$ 0.52</span>
            </div>
            <div style={{marginTop: '10px'}}>
              <button className="dashboard-btn">Refresh</button>
            </div>

            {/* 2. Autonomous Resources */}
            <h2 className="dashboard-title">Autonomous Resources</h2>
            <div className="dashboard-section">
              <span className="dashboard-stat">Available Funds: <span className="dashboard-value">
                $ {balance ? parseFloat(balance.current_balance_usd).toFixed(2) : '0.00'}
              </span></span>
              <button className="dashboard-btn" onClick={() => handleDonateClick()}>Add Funds</button>
            </div>
            <div className="dashboard-section" style={{marginTop: '10px'}}>
              <span className="dashboard-stat">Auto-fund: <span className="dashboard-value">OFF</span></span>
              <button className="dashboard-btn">Enable</button>
            </div>
            <div className="dashboard-stat" style={{marginTop: '15px'}}>
              Funders: <span className="dashboard-value">{topFunders.length}</span>
            </div>
            {topFunders.length > 0 && (
              <>
                <div className="dashboard-stat" style={{marginTop: '5px'}}>
                  Top Funders: {topFunders.slice(0, 5).map((funder, index) => (
                    <span key={index}>
                      {index > 0 && ', '}
                      {funder.donor_name} (${parseFloat(funder.total_donated).toFixed(0)})
                    </span>
                  ))}
                </div>
                <div style={{marginTop: '8px'}}>
                  <button className="dashboard-btn">Show All</button>
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
                <strong>Fix authentication bug</strong> ($12)
              </div>
              <div className="dashboard-project-desc">
                Users unable to login with GitHub OAuth. Investigate token refresh issue.
              </div>
            </div>
            <div className="dashboard-project">
              <div className="dashboard-project-title">
                <strong>Optimize database queries</strong> ($25)
              </div>
              <div className="dashboard-project-desc">
                Slow loading times on dashboard. Add indexes to agents and executions tables.
              </div>
            </div>
            <div className="dashboard-project">
              <div className="dashboard-project-title">
                <strong>Implement caching layer</strong> ($45)
              </div>
              <div className="dashboard-project-desc">
                Add Redis caching for API responses to reduce database load by 60%.
              </div>
            </div>

            {/* Marketing Projects */}
            <h2 className="dashboard-title">Marketing Projects</h2>
            <div className="dashboard-project">
              <div className="dashboard-project-title">
                <strong>Launch product announcement</strong> ($18)
              </div>
              <div className="dashboard-project-desc">
                Create and schedule social media posts for new agent marketplace launch.
              </div>
            </div>
            <div className="dashboard-project">
              <div className="dashboard-project-title">
                <strong>Write blog post</strong> ($22)
              </div>
              <div className="dashboard-project-desc">
                Technical deep-dive on autonomous agents. Target: 2,000 words with code examples.
              </div>
            </div>
            <div className="dashboard-project">
              <div className="dashboard-project-title">
                <strong>Generate Instagram content</strong> ($15)
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
                    <div className="activity-item" style={{cursor: 'pointer', padding: '8px 0'}} onClick={() => window.location.href = '/documents'}>
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
                    <div className="activity-item" style={{cursor: 'pointer', padding: '8px 0'}} onClick={() => window.location.href = '/documents'}>
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

                {/* See More Button */}
                <div style={{marginTop: '10px'}}>
                  <button
                    className="dashboard-btn"
                    onClick={() => window.location.href = '/documents'}
                  >
                    See More
                  </button>
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
                {connections.length === 0 ? (
                  <div className="dashboard-stat" style={{fontStyle: 'italic', color: '#666'}}>
                    No connections yet. Connect your accounts in Settings.
                  </div>
                ) : (
                  <>
                    {connections.map((connection) => (
                      <div key={connection.id} className="dashboard-stat" style={{margin: '2px 0'}}>
                        {connection.service_name.charAt(0).toUpperCase() + connection.service_name.slice(1)}:
                        {connection.status === 'connected' ? (
                          <span className="dashboard-value"> Connected</span>
                        ) : (
                          <button
                            className="dashboard-btn"
                            style={{marginLeft: '5px'}}
                            onClick={() => window.location.href = '/settings'}
                          >
                            Connect
                          </button>
                        )}
                      </div>
                    ))}
                    <div style={{marginTop: '10px'}}>
                      <button
                        className="dashboard-btn"
                        onClick={() => window.location.href = '/connections'}
                      >
                        Show All
                      </button>
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
              padding: '30px',
              borderRadius: '4px',
              maxWidth: '800px',
              width: '100%',
              maxHeight: '80vh',
              overflow: 'auto',
              border: '1px solid #000',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontFamily: 'Times New Roman, Times, serif' }}>{selectedDocument.type}</h2>
              <button
                onClick={handleDocumentModalClose}
                style={{
                  background: 'linear-gradient(top, #ffffff, #888888)',
                  border: '1px solid #1a1a1a',
                  padding: '6px 12px',
                  cursor: 'pointer',
                  borderRadius: '2px',
                  fontFamily: 'Arial, Helvetica, sans-serif',
                  fontSize: '13px'
                }}
              >
                Close
              </button>
            </div>
            <div
              style={{
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
    </>
  );
}

export default Dashboard;
