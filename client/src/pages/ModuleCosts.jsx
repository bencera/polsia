import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTerminal } from '../contexts/TerminalContext';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import './ModuleCosts.css';

function ModuleCosts() {
  const [modulesCosts, setModulesCosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { token } = useAuth();
  const { terminalLogs } = useTerminal();
  const navigate = useNavigate();

  useEffect(() => {
    fetchModuleCosts();
  }, []);

  const fetchModuleCosts = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/cost-tracking/by-module?limit=50', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await response.json();

      if (response.ok) {
        setModulesCosts(data.data);
      } else {
        setError('Failed to load module costs');
      }
    } catch (err) {
      console.error('Error fetching module costs:', err);
      setError('Failed to load module costs. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatCost = (cost) => {
    if (cost === null || cost === undefined) return '$0.00';
    return `$${parseFloat(cost).toFixed(4)}`;
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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
            <div>&gt; Module Cost Breakdown</div>
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

      <div className="module-costs-container">
        <div className="module-costs-content">
          <div className="module-costs-header">
            <div>
              <h2>Cost by Module</h2>
              <p className="module-costs-subtitle">
                See which agents and modules are costing you the most
              </p>
            </div>
            <div className="header-buttons">
              <button onClick={() => navigate('/cost-tracking')} className="back-button">
                Back to Overview
              </button>
              <button onClick={fetchModuleCosts} className="refresh-button" disabled={loading}>
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          {loading ? (
            <div className="loading">Loading module costs...</div>
          ) : modulesCosts.length > 0 ? (
            <div className="module-costs-section">
              <div className="cost-table-container">
                <table className="cost-table">
                  <thead>
                    <tr>
                      <th>Module Name</th>
                      <th>Total Cost</th>
                      <th>Executions</th>
                      <th>Avg Cost</th>
                      <th>Last Run</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modulesCosts.map((module) => (
                      <tr key={module.id}>
                        <td className="module-name">{module.name}</td>
                        <td className="cost-value">{formatCost(module.total_cost)}</td>
                        <td>{module.execution_count}</td>
                        <td>{formatCost(module.avg_cost_per_execution)}</td>
                        <td>{formatDateTime(module.last_execution)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              No module execution data found. Run some modules to see cost breakdown.
            </div>
          )}

          <footer className="footer">
            <p className="footer-contact">Contact: <a href="mailto:system@polsia.ai">system@polsia.ai</a></p>
          </footer>
        </div>
      </div>
    </>
  );
}

export default ModuleCosts;
