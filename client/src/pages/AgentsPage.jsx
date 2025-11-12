import { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { useTerminal } from '../contexts/TerminalContext';
import './AgentsPage.css';

function AgentsPage() {
  const { token } = useAuth();
  const { terminalLogs, runRoutine, isStreaming } = useTerminal();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [runningAgents, setRunningAgents] = useState(new Set());
  const [expandedAgents, setExpandedAgents] = useState(new Set());
  const [promptPreviews, setPromptPreviews] = useState({});
  const [loadingPrompts, setLoadingPrompts] = useState({});
  const [filterMode, setFilterMode] = useState('all'); // 'all', 'scheduled', 'on_demand', 'task_driven'

  // Fetch agents from API
  useEffect(() => {
    fetchAgents();
  }, [token]);

  const fetchAgents = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/agents', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch agents');
      }

      const data = await response.json();
      setAgents(data.agents || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching agents:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleAgentStatus = async (agentId, currentStatus) => {
    try {
      const newStatus = currentStatus === 'active' ? 'disabled' : 'active';

      const response = await fetch(`/api/agents/${agentId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (!response.ok) {
        throw new Error('Failed to update agent status');
      }

      const data = await response.json();

      // Update local state
      setAgents(agents.map(agent =>
        agent.id === agentId ? data.agent : agent
      ));
    } catch (err) {
      console.error('Error toggling agent status:', err);
      alert('Failed to update agent status');
    }
  };

  const updateFrequency = async (agentId, frequency) => {
    try {
      // Determine execution_mode based on frequency
      const execution_mode = frequency === 'manual' ? 'on_demand' : 'scheduled';
      const schedule_frequency = frequency === 'manual' ? null : frequency;

      const response = await fetch(`/api/agents/${agentId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          execution_mode,
          schedule_frequency
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update frequency');
      }

      const data = await response.json();

      // Update local state
      setAgents(agents.map(agent =>
        agent.id === agentId ? data.agent : agent
      ));
    } catch (err) {
      console.error('Error updating frequency:', err);
      alert('Failed to update frequency');
    }
  };

  const updateGuardrails = async (agentId, guardrail, value) => {
    try {
      const agent = agents.find(m => m.id === agentId);
      const newConfig = {
        ...agent.config,
        guardrails: {
          ...agent.config?.guardrails,
          [guardrail]: value
        }
      };

      const response = await fetch(`/api/agents/${agentId}`, {
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
      setAgents(agents.map(m =>
        m.id === agentId ? data.agent : m
      ));
    } catch (err) {
      console.error('Error updating guardrails:', err);
      alert('Failed to update guardrails');
    }
  };

  const toggleAgentExpand = (agentId) => {
    setExpandedAgents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(agentId)) {
        newSet.delete(agentId);
      } else {
        newSet.add(agentId);
      }
      return newSet;
    });
  };

  const runAgentNow = async (agentId, agentName) => {
    // Mark agent as running
    setRunningAgents(prev => new Set([...prev, agentId]));

    // Use context's runRoutine function (works for unified agents)
    const success = await runRoutine(agentId, agentName);

    if (!success) {
      alert('Failed to run agent');
      setRunningAgents(prev => {
        const newSet = new Set(prev);
        newSet.delete(agentId);
        return newSet;
      });
      return;
    }

    // Poll for completion and refresh the list when done
    pollForCompletion(agentId);
  };

  const pollForCompletion = async (agentId) => {
    // Poll every 2 seconds to check if execution completed
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/agents/${agentId}/executions?limit=1`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          clearInterval(pollInterval);
          setRunningAgents(prev => {
            const newSet = new Set(prev);
            newSet.delete(agentId);
            return newSet;
          });
          return;
        }

        const data = await response.json();
        const latestExecution = data.executions?.[0];

        // If execution completed or failed, refresh the list
        if (latestExecution && (latestExecution.status === 'completed' || latestExecution.status === 'failed')) {
          clearInterval(pollInterval);
          setRunningAgents(prev => {
            const newSet = new Set(prev);
            newSet.delete(agentId);
            return newSet;
          });
          // Refresh the agents list to update "Last run" timestamp
          fetchAgents();
        }
      } catch (err) {
        console.error('Error polling for completion:', err);
        clearInterval(pollInterval);
        setRunningAgents(prev => {
          const newSet = new Set(prev);
          newSet.delete(agentId);
          return newSet;
        });
      }
    }, 2000);

    // Stop polling after 10 minutes (safety timeout)
    setTimeout(() => {
      clearInterval(pollInterval);
      setRunningAgents(prev => {
        const newSet = new Set(prev);
        newSet.delete(agentId);
        return newSet;
      });
    }, 600000);
  };

  const fetchPromptPreview = async (agentId) => {
    setLoadingPrompts(prev => ({ ...prev, [agentId]: true }));
    try {
      const response = await fetch(`/api/agents/${agentId}/prompt-preview`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch prompt preview');
      }

      const data = await response.json();
      setPromptPreviews(prev => ({ ...prev, [agentId]: data.prompt }));
    } catch (err) {
      console.error('Error fetching prompt preview:', err);
      alert('Failed to load prompt preview');
    } finally {
      setLoadingPrompts(prev => ({ ...prev, [agentId]: false }));
    }
  };

  const activeCount = agents.filter(m => m.status === 'active').length;

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
      <div className="agents-container">
        <div className="terminal">
          <span>&gt; Autonomous Operations Control</span>
        </div>
        <Navbar />
        <div className="agents-content">
          <p style={{ textAlign: 'center', marginTop: '40px' }}>Loading agents...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="agents-container">
        <div className="terminal">
          <span>&gt; Autonomous Operations Control</span>
        </div>
        <Navbar />
        <div className="agents-content">
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

      <div className="agents-container">

      <div className="agents-content">
        <div className="agents-header">
          <h2>Agents</h2>
          <p className="agents-subtitle">
            Autonomous AI agents that run on schedules to handle your tasks
          </p>
          <p className="agents-status">
            {activeCount} {activeCount === 1 ? 'agent' : 'agents'} active
          </p>
        </div>

        {agents.length === 0 ? (
          <div style={{ textAlign: 'center', marginTop: '40px', color: '#666' }}>
            <p>No agents created yet.</p>
            <p style={{ fontSize: '14px', marginTop: '10px' }}>
              Agents will appear here once created via the API.
            </p>
          </div>
        ) : (
          <div className="agents-list">
            {agents.map((agent) => {
              const isExpanded = expandedAgents.has(agent.id);
              const config = agent.config || {};

              return (
                <div key={agent.id} className="agent-card">
                        <div className="agent-main">
                          <button
                            className="expand-btn"
                            onClick={() => toggleAgentExpand(agent.id)}
                            aria-label={isExpanded ? "Collapse details" : "Expand details"}
                          >
                            <span className={`chevron ${isExpanded ? 'expanded' : ''}`}>▼</span>
                          </button>

                          <div className="agent-info">
                            <h3 className={`agent-name ${agent.status !== 'active' ? 'disabled' : ''}`}>
                              {agent.name}
                            </h3>
                            <p className={`agent-description ${agent.status !== 'active' ? 'disabled' : ''}`}>
                              {agent.description}
                            </p>

                            <div className="agent-meta">
                              <span className={`agent-status ${agent.status}`}>
                                {agent.status}
                              </span>
                              <span className="agent-type">
                                Type: {agent.agent_type || agent.type}
                              </span>
                              <span className="agent-type">
                                Mode: {agent.execution_mode || 'on_demand'}
                              </span>
                              <span className="agent-last-run">
                                Last run: {formatLastRun(agent.last_run_at)}
                              </span>
                            </div>
                          </div>

                          <div className="agent-controls">
                            <button
                              className="toggle-status-btn"
                              onClick={() => toggleAgentStatus(agent.id, agent.status)}
                            >
                              {agent.status === 'active' ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              className="run-now-btn"
                              onClick={() => runAgentNow(agent.id, agent.name)}
                              disabled={runningAgents.has(agent.id)}
                            >
                              {runningAgents.has(agent.id) ? 'Running...' : 'Run Now'}
                            </button>
                            <select
                              className="agent-frequency-select"
                              value={
                                agent.execution_mode === 'scheduled'
                                  ? (agent.schedule_frequency || agent.frequency || 'daily')
                                  : 'manual'
                              }
                              onChange={(e) => updateFrequency(agent.id, e.target.value)}
                            >
                              <option value="manual">MANUAL</option>
                              <option value="auto">AUTO</option>
                              <option value="daily">DAILY</option>
                              <option value="weekly">WEEKLY</option>
                            </select>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="agent-details">
                            {/* COMPLETE EXECUTION CONFIGURATION */}
                            <div className="detail-section" style={{ backgroundColor: '#f9f9f9', padding: '15px', borderLeft: '3px solid #000' }}>
                              <h4 className="detail-label" style={{ fontSize: '1.1em', marginBottom: '15px' }}>📋 Complete Execution Configuration</h4>
                              <div style={{ fontSize: '.9em', lineHeight: '1.7' }}>
                                <p style={{ margin: '0 0 10px', fontWeight: '600' }}>What runs:</p>
                                <ul style={{ margin: '0 0 15px', paddingLeft: '20px' }}>
                                  <li><strong>Agent:</strong> {agent.name}</li>
                                  <li><strong>Type:</strong> {agent.agent_type || agent.type}</li>
                                  <li><strong>Execution Mode:</strong> {agent.execution_mode || 'on_demand'}</li>
                                  {agent.execution_mode === 'scheduled' && (
                                    <li><strong>Schedule Frequency:</strong> {agent.schedule_frequency || agent.frequency || 'daily'}</li>
                                  )}
                                </ul>

                                <p style={{ margin: '0 0 10px', fontWeight: '600' }}>How it runs:</p>
                                <ul style={{ margin: '0 0 15px', paddingLeft: '20px' }}>
                                  <li><strong>MCP Tools Available:</strong> {config.mcpMounts?.length > 0 ? config.mcpMounts.join(', ') : 'None'}</li>
                                  <li><strong>Max Turns:</strong> {config.maxTurns || 'Default (100)'}</li>
                                  {agent.type === 'render_analytics' && (
                                    <li><strong>Pre-execution:</strong> GitHub repo auto-cloned to ./github-repo</li>
                                  )}
                                </ul>

                                <p style={{ margin: '0 0 10px', fontWeight: '600' }}>What it does:</p>
                                <div style={{ backgroundColor: '#fff', padding: '10px', border: '1px solid #ddd', whiteSpace: 'pre-wrap' }}>
                                  {config.goal || agent.description || 'No goal specified'}
                                </div>
                              </div>
                            </div>

                            {/* Special note for render_analytics */}
                            {agent.type === 'render_analytics' && (
                              <div className="detail-section" style={{ backgroundColor: '#f0f9ff', padding: '15px', borderLeft: '3px solid #0066cc' }}>
                                <h4 className="detail-label" style={{ color: '#0066cc' }}>🔄 Auto-Clone Behavior</h4>
                                <div className="detail-content" style={{ fontSize: '.95em', lineHeight: '1.6' }}>
                                  <p style={{ margin: '0 0 8px 0' }}>
                                    <strong>Before execution:</strong> The primary GitHub repository will be automatically cloned to <code>./github-repo</code>.
                                  </p>
                                  <p style={{ margin: '0 0 8px 0' }}>
                                    The agent will use standard file reading tools (cat, grep, etc.) to explore the repository and understand the database schema.
                                  </p>
                                  <p style={{ margin: '0', fontStyle: 'italic', color: '#666' }}>
                                    Note: GitHub MCP is automatically excluded for this agent type since the repository is already available locally.
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* Full Prompt Preview */}
                            <div className="detail-section">
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <h4 className="detail-label" style={{ margin: 0 }}>Complete Prompt Sent to Agent</h4>
                                <button
                                  onClick={() => fetchPromptPreview(agent.id)}
                                  disabled={loadingPrompts[agent.id]}
                                  className="toggle-status-btn"
                                  style={{ fontSize: '11px', padding: '3px 10px' }}
                                >
                                  {loadingPrompts[agent.id] ? 'Loading...' : promptPreviews[agent.id] ? 'Refresh' : 'View Full Prompt'}
                                </button>
                              </div>
                              {!promptPreviews[agent.id] ? (
                                <div style={{ padding: '15px', backgroundColor: '#f9f9f9', border: '1px solid #ddd', fontSize: '.9em', color: '#666' }}>
                                  Click "View Full Prompt" to see the exact prompt that will be sent to the agent, including:<br/>
                                  • Agent role and identity<br/>
                                  • Agent goal and instructions<br/>
                                  • Current date/time context<br/>
                                  • Workspace and repository information<br/>
                                  • Available MCP tools
                                </div>
                              ) : (
                                <div className="detail-content prompt-content" style={{ backgroundColor: '#f9f9f9', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '.85em', maxHeight: '400px', overflow: 'auto' }}>
                                  {promptPreviews[agent.id]}
                                </div>
                              )}
                            </div>

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

                            {/* Agent-specific settings */}
                            {(config.maxEmails || config.query) && (
                              <div className="detail-section">
                                <h4 className="detail-label">Agent-Specific Settings</h4>
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
                                    {new Date(agent.created_at).toLocaleString()}
                                  </span>
                                </div>
                                <div className="setting-item">
                                  <span className="setting-key">Last Updated:</span>
                                  <span className="setting-value">
                                    {new Date(agent.updated_at).toLocaleString()}
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
