import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTerminal } from '../contexts/TerminalContext';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import './CostTracking.css';

function CostTracking() {
  const [summary, setSummary] = useState(null);
  const [executionHistory, setExecutionHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { token } = useAuth();
  const { terminalLogs } = useTerminal();
  const navigate = useNavigate();

  useEffect(() => {
    fetchCostData();
  }, []);

  const fetchCostData = async () => {
    setLoading(true);
    setError('');
    try {
      // Fetch summary and execution history in parallel
      const [summaryRes, historyRes] = await Promise.all([
        fetch('/api/cost-tracking/summary', {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch('/api/cost-tracking/history?limit=100', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      const summaryData = await summaryRes.json();
      const historyData = await historyRes.json();

      if (summaryRes.ok) setSummary(summaryData.data);
      if (historyRes.ok) setExecutionHistory(historyData.data);

      if (!summaryRes.ok || !historyRes.ok) {
        setError('Failed to load some cost data');
      }
    } catch (err) {
      console.error('Error fetching cost data:', err);
      setError('Failed to load cost data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatCost = (cost) => {
    if (cost === null || cost === undefined) return '$0.00';
    return `$${parseFloat(cost).toFixed(4)}`;
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (ms) => {
    if (!ms) return 'N/A';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
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

  // Get last 5 logs for terminal display
  const displayLogs = terminalLogs.slice(-5);

  return (
    <>
      <div className="terminal">
        {displayLogs.length === 0 ? (
          <>
            <div>&gt; Cost Analytics Dashboard</div>
            <div>&nbsp;</div>
            <div>&nbsp;</div>
            <div>&nbsp;</div>
            <div>&nbsp;</div></>
        ) : (
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

      <Navbar />

      <div className="cost-tracking-container">
        <div className="cost-tracking-content">
          <div className="cost-tracking-header">
            <h2>Cost Tracking</h2>
            <div className="header-buttons">
              <button onClick={() => navigate('/module-costs')} className="view-modules-button">
                View by Module
              </button>
              <button onClick={fetchCostData} className="refresh-button" disabled={loading}>
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          {loading && !summary ? (
            <div className="loading">Loading cost data...</div>
          ) : (
            <>
              {/* Cost Summary Cards */}
              {summary && (
                <div className="cost-summary">
                  <div className="cost-card">
                    <h3>Total Lifetime</h3>
                    <div className="cost-value">{formatCost(summary.total_cost)}</div>
                    <div className="cost-meta">{summary.total_executions} executions</div>
                  </div>
                  <div className="cost-card">
                    <h3>Today</h3>
                    <div className="cost-value">{formatCost(summary.today_cost)}</div>
                  </div>
                  <div className="cost-card">
                    <h3>This Week</h3>
                    <div className="cost-value">{formatCost(summary.week_cost)}</div>
                  </div>
                  <div className="cost-card">
                    <h3>This Month</h3>
                    <div className="cost-value">{formatCost(summary.month_cost)}</div>
                  </div>
                </div>
              )}

              {/* Detailed Execution History */}
              {executionHistory.length > 0 && (
                <div className="cost-section">
                  <h3>Execution History</h3>
                  <div className="cost-table-container">
                    <table className="cost-table execution-table">
                      <thead>
                        <tr>
                          <th>Agent</th>
                          <th>Time</th>
                          <th>Cost</th>
                          <th>Duration</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {executionHistory.map((execution) => {
                          return (
                            <tr key={execution.id}>
                              <td>{execution.module_name || 'Unknown'}</td>
                              <td>{formatDateTime(execution.completed_at || execution.started_at)}</td>
                              <td>{formatCost(execution.cost_usd)}</td>
                              <td>{formatDuration(execution.duration_ms)}</td>
                              <td>
                                <span className={`status-badge status-${execution.status}`}>
                                  {execution.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {executionHistory.length === 0 && !loading && (
                <div className="empty-state">
                  No execution history found. Run some modules to see cost data.
                </div>
              )}
            </>
          )}

          <footer className="footer">
            <p className="footer-contact">Contact: <a href="mailto:system@polsia.ai">system@polsia.ai</a></p>
          </footer>
        </div>
      </div>
    </>
  );
}

export default CostTracking;
