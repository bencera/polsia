import { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { useTerminal } from '../contexts/TerminalContext';
import './AgentsPage.css';

function AgentsPage() {
  const { token } = useAuth();
  const { terminalLogs, runRoutine, isStreaming } = useTerminal();
  const [routines, setRoutines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [runningRoutines, setRunningRoutines] = useState(new Set());
  const [expandedRoutines, setExpandedRoutines] = useState(new Set());
  const [promptPreviews, setPromptPreviews] = useState({});
  const [loadingPrompts, setLoadingPrompts] = useState({});

  // Fetch routines from API
  useEffect(() => {
    fetchRoutines();
  }, [token]);

  const fetchRoutines = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/routines', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch routines');
      }

      const data = await response.json();
      setRoutines(data.routines || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching routines:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleRoutineStatus = async (routineId, currentStatus) => {
    try {
      const newStatus = currentStatus === 'active' ? 'disabled' : 'active';

      const response = await fetch(`/api/routines/${routineId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (!response.ok) {
        throw new Error('Failed to update routine status');
      }

      const data = await response.json();

      // Update local state
      setRoutines(routines.map(routine =>
        routine.id === routineId ? data.routine : routine
      ));
    } catch (err) {
      console.error('Error toggling routine status:', err);
      alert('Failed to update routine status');
    }
  };

  const updateFrequency = async (routineId, frequency) => {
    try {
      const response = await fetch(`/api/routines/${routineId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ frequency })
      });

      if (!response.ok) {
        throw new Error('Failed to update frequency');
      }

      const data = await response.json();

      // Update local state
      setRoutines(routines.map(routine =>
        routine.id === routineId ? data.routine : routine
      ));
    } catch (err) {
      console.error('Error updating frequency:', err);
      alert('Failed to update frequency');
    }
  };

  const updateGuardrails = async (routineId, guardrail, value) => {
    try {
      const routine = routines.find(m => m.id === routineId);
      const newConfig = {
        ...routine.config,
        guardrails: {
          ...routine.config?.guardrails,
          [guardrail]: value
        }
      };

      const response = await fetch(`/api/routines/${routineId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ config: newConfig })
      });

      if (!response.ok) {
        throw new Error('Failed to update guardrails');
      }

      const data = await response.json();

      // Update local state
      setRoutines(routines.map(m =>
        m.id === routineId ? data.routine : m
      ));
    } catch (err) {
      console.error('Error updating guardrails:', err);
      alert('Failed to update guardrails');
    }
  };

  const toggleRoutineExpand = (routineId) => {
    setExpandedRoutines(prev => {
      const newSet = new Set(prev);
      if (newSet.has(routineId)) {
        newSet.delete(routineId);
      } else {
        newSet.add(routineId);
      }
      return newSet;
    });
  };

  const runRoutineNow = async (routineId, routineName) => {
    // Mark routine as running
    setRunningRoutines(prev => new Set([...prev, routineId]));

    // Use context's runRoutine function
    const success = await runRoutine(routineId, routineName);

    if (!success) {
      alert('Failed to run routine');
      setRunningRoutines(prev => {
        const newSet = new Set(prev);
        newSet.delete(routineId);
        return newSet;
      });
    }
  };

  const fetchPromptPreview = async (routineId) => {
    setLoadingPrompts(prev => ({ ...prev, [routineId]: true }));
    try {
      const response = await fetch(`/api/routines/${routineId}/prompt-preview`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch prompt preview');
      }

      const data = await response.json();
      setPromptPreviews(prev => ({ ...prev, [routineId]: data.prompt }));
    } catch (err) {
      console.error('Error fetching prompt preview:', err);
      alert('Failed to load prompt preview');
    } finally {
      setLoadingPrompts(prev => ({ ...prev, [routineId]: false }));
    }
  };

  const activeCount = routines.filter(m => m.status === 'active').length;

  // Format last run timestamp
  const formatLastRun = (lastRunAt) => {
    if (!lastRunAt) return 'Never run';

    const date = new Date(lastRunAt);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="routines-container">
        <div className="terminal">
          <span>&gt; Autonomous Operations Control</span>
        </div>
        <Navbar />
        <div className="routines-content">
          <p style={{ textAlign: 'center', marginTop: '40px' }}>Loading routines...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="routines-container">
        <div className="terminal">
          <span>&gt; Autonomous Operations Control</span>
        </div>
        <Navbar />
        <div className="routines-content">
          <p style={{ textAlign: 'center', marginTop: '40px', color: '#ff4444' }}>
            Error: {error}
          </p>
        </div>
      </div>
    );
  }

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

      <div className="routines-container">

      <div className="routines-content">
        <div className="routines-header">
          <h2>Agents</h2>
          <p className="routines-subtitle">
            Autonomous AI agents that run on schedules to handle your tasks
          </p>
          <p className="routines-status">
            {activeCount} {activeCount === 1 ? 'agent' : 'agents'} active
          </p>
        </div>

        {routines.length === 0 ? (
          <div style={{ textAlign: 'center', marginTop: '40px', color: '#666' }}>
            <p>No agents created yet.</p>
            <p style={{ fontSize: '14px', marginTop: '10px' }}>
              Agents will appear here once created via the API.
            </p>
          </div>
        ) : (
          <div className="routines-list">
            {routines.map((routine) => {
              const isExpanded = expandedRoutines.has(routine.id);
              const config = routine.config || {};

              return (
                <div key={routine.id} className="routine-card">
                        <div className="routine-main">
                          <button
                            className="expand-btn"
                            onClick={() => toggleRoutineExpand(routine.id)}
                            aria-label={isExpanded ? "Collapse details" : "Expand details"}
                          >
                            <span className={`chevron ${isExpanded ? 'expanded' : ''}`}>▼</span>
                          </button>

                          <div className="routine-info">
                            <h3 className={`routine-name ${routine.status !== 'active' ? 'disabled' : ''}`}>
                              {routine.name}
                            </h3>
                            <p className={`routine-description ${routine.status !== 'active' ? 'disabled' : ''}`}>
                              {routine.description}
                            </p>

                            <div className="routine-meta">
                              <span className={`routine-status ${routine.status}`}>
                                {routine.status}
                              </span>
                              <span className="routine-type">
                                Type: {routine.type}
                              </span>
                              {routine.agent_name && (
                                <span className="routine-agent">
                                  Agent: {routine.agent_name}
                                </span>
                              )}
                              <span className="routine-last-run">
                                Last run: {formatLastRun(routine.last_run_at)}
                              </span>
                            </div>
                          </div>

                          <div className="routine-controls">
                            <button
                              className="toggle-status-btn"
                              onClick={() => toggleRoutineStatus(routine.id, routine.status)}
                            >
                              {routine.status === 'active' ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              className="run-now-btn"
                              onClick={() => runRoutineNow(routine.id, routine.name)}
                              disabled={runningRoutines.has(routine.id)}
                            >
                              {runningRoutines.has(routine.id) ? 'Running...' : 'Run Now'}
                            </button>
                            <select
                              className="routine-frequency-select"
                              value={routine.frequency}
                              onChange={(e) => updateFrequency(routine.id, e.target.value)}
                            >
                              <option value="auto">AUTO</option>
                              <option value="daily">DAILY</option>
                              <option value="weekly">WEEKLY</option>
                              <option value="manual">MANUAL</option>
                            </select>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="routine-details">
                            {/* Special note for render_analytics */}
                            {routine.type === 'render_analytics' && (
                              <div className="detail-section" style={{ backgroundColor: '#f0f9ff', padding: '15px', borderLeft: '3px solid #0066cc' }}>
                                <h4 className="detail-label" style={{ color: '#0066cc' }}>🔄 Auto-Clone Configuration</h4>
                                <div className="detail-content" style={{ fontSize: '.95em', lineHeight: '1.6' }}>
                                  <p style={{ margin: '0 0 8px 0' }}>
                                    <strong>Before execution:</strong> The primary GitHub repository will be automatically cloned to <code>./github-repo</code> in the agent's workspace.
                                  </p>
                                  <p style={{ margin: '0 0 8px 0' }}>
                                    The agent will use standard file reading tools (cat, grep, etc.) to explore the repository and understand the database schema.
                                  </p>
                                  <p style={{ margin: '0', fontStyle: 'italic', color: '#666' }}>
                                    Note: GitHub MCP is automatically excluded for this routine type since the repository is already available locally.
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* Agent Prompt */}
                            {config.goal && (
                              <div className="detail-section">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                  <h4 className="detail-label" style={{ margin: 0 }}>Agent Goal</h4>
                                  <button
                                    onClick={() => fetchPromptPreview(routine.id)}
                                    disabled={loadingPrompts[routine.id]}
                                    className="toggle-status-btn"
                                    style={{ fontSize: '11px', padding: '3px 10px' }}
                                  >
                                    {loadingPrompts[routine.id] ? 'Loading...' : 'View Full Prompt'}
                                  </button>
                                </div>
                                <div className="detail-content prompt-content">
                                  {config.goal}
                                </div>
                                {!promptPreviews[routine.id] && (
                                  <div style={{ marginTop: '10px', fontSize: '.85em', color: '#666', fontStyle: 'italic' }}>
                                    Note: The actual prompt sent to the agent includes additional context (date/time, routine info, workspace details, and instructions). Click "View Full Prompt" to see it.
                                  </div>
                                )}
                                {promptPreviews[routine.id] && (
                                  <div style={{ marginTop: '15px' }}>
                                    <h4 className="detail-label" style={{ fontSize: '.9em', color: '#0066cc' }}>Full Prompt (As Sent to Agent)</h4>
                                    <div className="detail-content prompt-content" style={{ backgroundColor: '#f9f9f9', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '.85em' }}>
                                      {promptPreviews[routine.id]}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* MCP Servers */}
                            {config.mcpMounts && config.mcpMounts.length > 0 && (
                              <div className="detail-section">
                                <h4 className="detail-label">MCP Servers Available</h4>
                                <div className="detail-content">
                                  <div className="mcp-mounts">
                                    {config.mcpMounts.map((mount, idx) => (
                                      <span key={idx} className="mcp-mount-badge">{mount}</span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* MCP Configuration */}
                            {config.mcpConfig && Object.keys(config.mcpConfig).length > 0 && (
                              <div className="detail-section">
                                <h4 className="detail-label">MCP Configuration</h4>
                                <div className="detail-content">
                                  <pre className="config-code">
                                    {JSON.stringify(config.mcpConfig, null, 2)}
                                  </pre>
                                </div>
                              </div>
                            )}

                            {/* Execution Settings */}
                            <div className="detail-section">
                              <h4 className="detail-label">Execution Settings</h4>
                              <div className="detail-content settings-grid">
                                {config.maxTurns && (
                                  <div className="setting-item">
                                    <span className="setting-key">Max Turns:</span>
                                    <span className="setting-value">{config.maxTurns}</span>
                                  </div>
                                )}
                                {config.guardrails && (
                                  <>
                                    {config.guardrails.requireApproval !== undefined && (
                                      <div className="setting-item">
                                        <span className="setting-key">Require Approval:</span>
                                        <span className="setting-value">
                                          {config.guardrails.requireApproval ? 'Yes' : 'No'}
                                        </span>
                                      </div>
                                    )}
                                    {config.guardrails.maxCost !== undefined && (
                                      <div className="setting-item">
                                        <span className="setting-key">Max Cost:</span>
                                        <span className="setting-value">
                                          ${config.guardrails.maxCost.toFixed(2)}
                                        </span>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Additional Configuration */}
                            {config.inputs && Object.keys(config.inputs).length > 0 && (
                              <div className="detail-section">
                                <h4 className="detail-label">Additional Configuration</h4>
                                <div className="detail-content">
                                  <pre className="config-code">
                                    {JSON.stringify(config.inputs, null, 2)}
                                  </pre>
                                </div>
                              </div>
                            )}

                            {/* Routine-specific settings */}
                            {(config.maxEmails || config.query) && (
                              <div className="detail-section">
                                <h4 className="detail-label">Routine-Specific Settings</h4>
                                <div className="detail-content settings-grid">
                                  {config.maxEmails && (
                                    <div className="setting-item">
                                      <span className="setting-key">Max Emails:</span>
                                      <span className="setting-value">{config.maxEmails}</span>
                                    </div>
                                  )}
                                  {config.query && (
                                    <div className="setting-item">
                                      <span className="setting-key">Query:</span>
                                      <span className="setting-value">{config.query}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Timestamps */}
                            <div className="detail-section">
                              <h4 className="detail-label">Metadata</h4>
                              <div className="detail-content settings-grid">
                                <div className="setting-item">
                                  <span className="setting-key">Created:</span>
                                  <span className="setting-value">
                                    {new Date(routine.created_at).toLocaleString()}
                                  </span>
                                </div>
                                <div className="setting-item">
                                  <span className="setting-key">Last Updated:</span>
                                  <span className="setting-value">
                                    {new Date(routine.updated_at).toLocaleString()}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
        )}
      </div>

        <footer className="footer">
          <p className="footer-contact">Contact: <a href="mailto:system@polsia.ai">system@polsia.ai</a></p>
        </footer>
      </div>
    </>
  );
}

export default AgentsPage;
