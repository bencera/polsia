import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './ModuleExecutionHistory.css';

function ModuleExecutionHistory({ moduleId, onClose }) {
  const { token } = useAuth();
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchExecutions();
  }, [moduleId, token]);

  const fetchExecutions = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/modules/${moduleId}/executions`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch execution history');
      }

      const data = await response.json();
      setExecutions(data.executions || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching execution history:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (durationMs) => {
    if (!durationMs) return 'N/A';
    const seconds = durationMs / 1000;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = seconds / 60;
    if (minutes < 60) return `${minutes.toFixed(1)} min`;
    const hours = minutes / 60;
    return `${hours.toFixed(1)} hrs`;
  };

  const formatCost = (costUsd) => {
    if (costUsd === null || costUsd === undefined) return 'N/A';
    return `$${parseFloat(costUsd).toFixed(4)}`;
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusClass = (status) => {
    switch (status) {
      case 'completed':
        return 'status-completed';
      case 'failed':
        return 'status-failed';
      case 'running':
        return 'status-running';
      case 'pending':
        return 'status-pending';
      default:
        return '';
    }
  };

  return (
    <div className="history-modal-overlay" onClick={onClose}>
      <div className="history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="history-header">
          <h2>Execution History</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="history-content">
          {loading ? (
            <p className="history-message">Loading execution history...</p>
          ) : error ? (
            <p className="history-message error">Error: {error}</p>
          ) : executions.length === 0 ? (
            <p className="history-message">No executions yet. Run this module to see history.</p>
          ) : (
            <div className="executions-list">
              {executions.map((execution) => (
                <div key={execution.id} className="execution-card">
                  <div className="execution-main">
                    <div className="execution-info">
                      <div className="execution-row">
                        <span className={`execution-status ${getStatusClass(execution.status)}`}>
                          {execution.status}
                        </span>
                        <span className="execution-trigger">
                          {execution.trigger_type || 'manual'}
                        </span>
                      </div>

                      <div className="execution-row">
                        <span className="execution-label">Started:</span>
                        <span className="execution-value">
                          {formatTimestamp(execution.started_at || execution.created_at)}
                        </span>
                      </div>

                      {execution.completed_at && (
                        <div className="execution-row">
                          <span className="execution-label">Completed:</span>
                          <span className="execution-value">
                            {formatTimestamp(execution.completed_at)}
                          </span>
                        </div>
                      )}

                      <div className="execution-row">
                        <span className="execution-label">Duration:</span>
                        <span className="execution-value">
                          {formatDuration(execution.duration_ms)}
                        </span>
                      </div>

                      <div className="execution-row">
                        <span className="execution-label">Cost:</span>
                        <span className="execution-value">
                          {formatCost(execution.cost_usd)}
                        </span>
                      </div>

                      {execution.error_message && (
                        <div className="execution-error">
                          <span className="execution-label">Error:</span>
                          <span className="execution-value">{execution.error_message}</span>
                        </div>
                      )}

                      {execution.metadata && (
                        <div className="execution-metadata">
                          {execution.metadata.turns && (
                            <span className="metadata-item">
                              Turns: {execution.metadata.turns}
                            </span>
                          )}
                          {execution.metadata.tools_used && (
                            <span className="metadata-item">
                              Tools: {execution.metadata.tools_used.join(', ')}
                            </span>
                          )}
                          {execution.metadata.files_modified && execution.metadata.files_modified.length > 0 && (
                            <span className="metadata-item">
                              Files: {execution.metadata.files_modified.length}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ModuleExecutionHistory;
