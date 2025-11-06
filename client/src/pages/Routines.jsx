import { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { useTerminal } from '../contexts/TerminalContext';
import './Routines.css';

function Routines() {
  const { token } = useAuth();
  const { terminalLogs, runRoutine, isStreaming } = useTerminal();
  const [routines, setRoutines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [runningRoutines, setRunningRoutines] = useState(new Set());
  const [expandedRoutines, setExpandedRoutines] = useState(new Set());

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
    if (!confirm(`Run "${routineName}" now?`)) {
      return;
    }

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

  const activeCount = routines.filter(m => m.status === 'active').length;

  // Group routines by MCP server
  const groupRoutinesByMCP = (routines) => {
    const groups = {
      'multi-integration': [],
      'appstore_connect': [],
      'github': [],
      'gmail': [],
      'meta_ads': [],
      'render': [],
      'reports': [],
      'sentry': [],
      'slack': [],
      'tasks': [],
      'general': []
    };

    const mcpDisplayNames = {
      'multi-integration': 'Multi-Integration Routines',
      'appstore_connect': 'App Store Connect',
      'github': 'GitHub',
      'gmail': 'Gmail',
      'meta_ads': 'Meta Ads',
      'render': 'Render',
      'reports': 'Reports',
      'sentry': 'Sentry',
      'slack': 'Slack',
      'tasks': 'Tasks',
      'general': 'General Routines'
    };

    routines.forEach(routine => {
      const mcpMounts = routine.config?.mcpMounts || [];

      // Routines with 3+ MCPs go to multi-integration
      if (mcpMounts.length >= 3) {
        groups['multi-integration'].push(routine);
      }
      // Routines with primary MCP (first in array)
      else if (mcpMounts.length > 0) {
        const primaryMCP = mcpMounts[0];
        if (groups[primaryMCP]) {
          groups[primaryMCP].push(routine);
        } else {
          groups['general'].push(routine);
        }
      }
      // Routines with no MCPs
      else {
        groups['general'].push(routine);
      }
    });

    // Return only non-empty groups in order
    const orderedGroups = [
      'multi-integration',
      'appstore_connect',
      'github',
      'gmail',
      'meta_ads',
      'render',
      'reports',
      'sentry',
      'slack',
      'tasks',
      'general'
    ];

    return orderedGroups
      .filter(key => groups[key].length > 0)
      .map(key => ({
        key,
        displayName: mcpDisplayNames[key],
        routines: groups[key]
      }));
  };

  const groupedRoutines = groupRoutinesByMCP(routines);

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
    <div className="routines-container">
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

      <div className="routines-content">
        <div className="routines-header">
          <h2>Routines</h2>
          <p className="routines-subtitle">
            Active routines will run automatically based on their frequency.
            You can adjust settings or disable specific routines.
          </p>
          <p className="routines-status">
            {activeCount} {activeCount === 1 ? 'routine' : 'routines'} active
          </p>
        </div>

        {routines.length === 0 ? (
          <div style={{ textAlign: 'center', marginTop: '40px', color: '#666' }}>
            <p>No routines created yet.</p>
            <p style={{ fontSize: '14px', marginTop: '10px' }}>
              Routines will appear here once created via the API.
            </p>
          </div>
        ) : (
          <>
            {groupedRoutines.map((group) => (
              <div key={group.key} className="routine-section">
                <div className="section-header">
                  <h3 className="section-title">{group.displayName}</h3>
                  <span className="section-count">
                    {group.routines.length} {group.routines.length === 1 ? 'routine' : 'routines'}
                  </span>
                </div>
                <div className="routines-list">
                  {group.routines.map((routine) => {
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
                            {/* Agent Prompt */}
                            {config.goal && (
                              <div className="detail-section">
                                <h4 className="detail-label">Agent Prompt</h4>
                                <div className="detail-content prompt-content">
                                  {config.goal}
                                </div>
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
              </div>
            ))}
          </>
        )}
      </div>

      <footer className="footer">
        <p className="footer-contact">Contact: <a href="mailto:system@polsia.ai">system@polsia.ai</a></p>
      </footer>
    </div>
  );
}

export default Routines;
