import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTerminal } from '../contexts/TerminalContext';
import Navbar from '../components/Navbar';
import './Agents.css';

function Agents() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedAgents, setExpandedAgents] = useState(new Set());
  const { token } = useAuth();
  const { terminalLogs } = useTerminal();

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/agents', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setAgents(data.agents || []);
        setError('');
      } else {
        setError(data.message || 'Failed to load agents');
      }
    } catch (err) {
      setError('Failed to load agents. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpanded = (agentId) => {
    const newExpanded = new Set(expandedAgents);
    if (newExpanded.has(agentId)) {
      newExpanded.delete(agentId);
    } else {
      newExpanded.add(agentId);
    }
    setExpandedAgents(newExpanded);
  };

  const getStatusClass = (status) => {
    const classes = {
      active: 'status-active',
      paused: 'status-paused',
      disabled: 'status-disabled'
    };
    return classes[status] || 'status-unknown';
  };

  const formatLogMessage = (log) => {
    const time = new Date(log.timestamp).toLocaleTimeString();
    return `[${time}] ${log.stage ? `[${log.stage}] ` : ''}${log.message}`;
  };

  const displayLogs = terminalLogs.slice(-4);

  return (
    <div className="agents-container">
      <div className="terminal">
        {displayLogs.length === 0 ? (
          <>
            <div>&gt; Agent Management System</div>
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
      <div className="agents-content">
        <div className="agents-header">
          <h1>Agents</h1>
          <p className="agents-subtitle">
            Task-driven AI agents that execute specific work assigned by Brain CEO
          </p>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {loading ? (
          <div className="loading">Loading agents...</div>
        ) : (
          <>
            <div className="agents-list">
              {agents.length === 0 ? (
                <div className="empty-state">
                  <p>No agents found. Run <code>npm run seed:agents</code> to create default agents.</p>
                </div>
              ) : (
                agents.map(agent => {
                  const isExpanded = expandedAgents.has(agent.id);

                  return (
                    <div
                      key={agent.id}
                      className={`agent-card ${isExpanded ? 'expanded' : ''}`}
                    >
                      <div
                        className="agent-header"
                        onClick={() => toggleExpanded(agent.id)}
                      >
                        <div className="agent-header-left">
                          <div className="agent-title-section">
                            <h3 className="agent-name">{agent.name}</h3>
                            <div className="agent-meta">
                              <span className="agent-type">{agent.agent_type}</span>
                              <span className={`agent-status ${getStatusClass(agent.status)}`}>
                                {agent.status}
                              </span>
                            </div>
                          </div>
                        </div>
                        <span className="expand-indicator">
                          {isExpanded ? '−' : '+'}
                        </span>
                      </div>

                      {isExpanded && (
                        <div className="agent-details">
                          <div className="agent-section">
                            <div className="section-label">Description</div>
                            <p className="agent-description">
                              {agent.description || 'No description provided'}
                            </p>
                          </div>

                          <div className="agent-section">
                            <div className="section-label">Role & Capabilities</div>
                            <pre className="agent-role">{agent.role}</pre>
                          </div>

                          {agent.config && (
                            <div className="agent-section">
                              <div className="section-label">Configuration</div>
                              <div className="config-list">
                                {agent.config.mcpMounts && agent.config.mcpMounts.length > 0 && (
                                  <div className="config-item">
                                    <strong>MCP Servers:</strong>
                                    <div className="mcp-mounts">
                                      {agent.config.mcpMounts.map(mount => (
                                        <span key={mount} className="mcp-mount">{mount}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {agent.config.maxTurns && (
                                  <div className="config-item">
                                    <strong>Max Turns:</strong> {agent.config.maxTurns}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          <div className="agent-section">
                            <div className="section-label">Session Info</div>
                            <div className="metadata-list">
                              {agent.session_id ? (
                                <>
                                  <div><strong>Session ID:</strong> {agent.session_id.substring(0, 12)}...</div>
                                  <div><strong>Workspace:</strong> {agent.workspace_path || 'Not set'}</div>
                                  {agent.last_active_at && (
                                    <div><strong>Last Active:</strong> {new Date(agent.last_active_at).toLocaleString()}</div>
                                  )}
                                </>
                              ) : (
                                <div style={{ color: '#888' }}>No session created yet (will be created on first execution)</div>
                              )}
                            </div>
                          </div>

                          <div className="agent-section">
                            <div className="section-label">Statistics</div>
                            <div className="metadata-list">
                              <div><strong>Routine Runs:</strong> {agent.total_routine_runs || 0}</div>
                              <div><strong>Task Completions:</strong> {agent.total_task_completions || 0}</div>
                              <div><strong>Total Executions:</strong> {(agent.total_routine_runs || 0) + (agent.total_task_completions || 0)}</div>
                            </div>
                          </div>

                          <div className="agent-section">
                            <div className="section-label">Metadata</div>
                            <div className="metadata-list">
                              <div>Agent ID: {agent.id}</div>
                              <div>Created: {new Date(agent.created_at).toLocaleString()}</div>
                              {agent.updated_at && (
                                <div>Updated: {new Date(agent.updated_at).toLocaleString()}</div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Agents;
