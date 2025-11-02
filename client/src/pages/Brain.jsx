import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTerminal } from '../contexts/TerminalContext';
import Navbar from '../components/Navbar';
import './Brain.css';

function Brain() {
  const [brainStatus, setBrainStatus] = useState(null);
  const [decisions, setDecisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState('');
  const { token } = useAuth();
  const { terminalLogs } = useTerminal();

  useEffect(() => {
    fetchBrainStatus();
    fetchDecisions();
  }, []);

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
      } else {
        setError(data.message || 'Failed to load Brain status');
      }
    } catch (err) {
      setError('Failed to load Brain status. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchDecisions = async () => {
    try {
      const response = await fetch('/api/brain/decisions?limit=10', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setDecisions(data.decisions || []);
      }
    } catch (err) {
      console.error('Failed to fetch decisions:', err);
    }
  };

  const triggerBrainCycle = async () => {
    if (triggering) return;

    setTriggering(true);
    setError('');

    try {
      const response = await fetch('/api/brain/trigger', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        alert(`Brain cycle completed!\n\nAction: ${data.decision.action}\n\nExecution: ${data.execution.success ? 'Success' : 'Failed'}\nCost: $${data.total_cost_usd.toFixed(4)}\nDuration: ${(data.total_duration_ms / 1000).toFixed(2)}s`);

        // Refresh status and decisions
        await fetchBrainStatus();
        await fetchDecisions();
      } else {
        setError(data.message || 'Failed to trigger Brain cycle');
        alert(`Brain cycle failed: ${data.error || data.message}`);
      }
    } catch (err) {
      setError('Failed to trigger Brain cycle. Please try again.');
      alert('Failed to trigger Brain cycle. Please try again.');
    } finally {
      setTriggering(false);
    }
  };

  const formatTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const formatLogMessage = (log) => {
    const time = new Date(log.timestamp).toLocaleTimeString();
    return `[${time}] ${log.stage ? `[${log.stage}] ` : ''}${log.message}`;
  };

  const displayLogs = terminalLogs.slice(-4);

  return (
    <div className="brain-container">
      <div className="terminal">
        {displayLogs.length === 0 ? (
          <>
            <div>&gt; Brain Orchestrator Control</div>
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

      <div className="brain-content">
        {loading && (
          <div className="status-message">
            <p>Loading Brain status...</p>
          </div>
        )}

        {error && !loading && (
          <div className="status-message error">
            <p>{error}</p>
          </div>
        )}

        {!loading && brainStatus && (
          <>
            {/* Brain Status Card */}
            <div className="brain-status-card">
              <h2>🧠 Brain Status</h2>

              {brainStatus.status === 'never_run' ? (
                <div className="status-info">
                  <p className="status-label">Status: <span className="status-value inactive">Never Run</span></p>
                  <p className="status-description">The Brain has never executed for your account. Trigger a cycle to get started!</p>
                </div>
              ) : (
                <div className="status-info">
                  <p className="status-label">Status: <span className="status-value active">Active</span></p>
                  <p className="status-label">Last Run: <span className="status-value">{formatTimeAgo(brainStatus.last_decision.created_at)}</span></p>

                  {brainStatus.last_decision && (
                    <div className="last-decision">
                      <h3>Last Decision</h3>
                      <p className="decision-action"><strong>Action:</strong> {brainStatus.last_decision.action}</p>
                      <p className="decision-module"><strong>Module:</strong> {brainStatus.last_decision.module_name}</p>
                      <p className="decision-priority"><strong>Priority:</strong> <span className={`priority-${brainStatus.last_decision.priority}`}>{brainStatus.last_decision.priority}</span></p>
                      {brainStatus.last_decision.execution_status && (
                        <p className="decision-status"><strong>Execution:</strong> <span className={`status-${brainStatus.last_decision.execution_status}`}>{brainStatus.last_decision.execution_status}</span></p>
                      )}
                      <details className="decision-reasoning">
                        <summary>View Reasoning</summary>
                        <p>{brainStatus.last_decision.reasoning}</p>
                      </details>
                    </div>
                  )}
                </div>
              )}

              <button
                className="trigger-button"
                onClick={triggerBrainCycle}
                disabled={triggering}
              >
                {triggering ? 'Running Brain Cycle...' : 'Trigger Brain Cycle Now'}
              </button>
            </div>

            {/* Decision History */}
            <div className="decision-history">
              <h2>Decision History</h2>

              {decisions.length === 0 ? (
                <div className="status-message">
                  <p>No decisions yet. The Brain will make its first decision when triggered.</p>
                </div>
              ) : (
                <div className="decisions-list">
                  {decisions.map((decision) => (
                    <div key={decision.id} className="decision-item">
                      <div className="decision-header">
                        <span className="decision-time">{formatTimeAgo(decision.created_at)}</span>
                        <span className={`decision-priority priority-${decision.priority}`}>{decision.priority}</span>
                      </div>

                      <h3 className="decision-action">{decision.action_description}</h3>

                      <div className="decision-meta">
                        <span className="decision-module">
                          📦 {decision.module_name} ({decision.module_type})
                        </span>
                        {decision.execution_status && (
                          <span className={`execution-status status-${decision.execution_status}`}>
                            {decision.execution_status === 'completed' ? '✓' : decision.execution_status === 'failed' ? '✗' : '⋯'} {decision.execution_status}
                          </span>
                        )}
                      </div>

                      {decision.execution_cost_usd != null && (
                        <div className="decision-cost">
                          💰 ${(parseFloat(decision.execution_cost_usd) || 0).toFixed(4)} | ⏱️ {((parseFloat(decision.execution_duration_ms) || 0) / 1000).toFixed(2)}s
                        </div>
                      )}

                      <details className="decision-reasoning">
                        <summary>View Full Reasoning</summary>
                        <p>{decision.decision_reasoning}</p>
                      </details>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <footer className="footer">
        <p className="footer-contact">Contact: <a href="mailto:system@polsia.ai">system@polsia.ai</a></p>
      </footer>
    </div>
  );
}

export default Brain;
