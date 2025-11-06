import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTerminal } from '../contexts/TerminalContext';
import Navbar from '../components/Navbar';
import './Tools.css';

function Tools() {
  const [mcpServers, setMcpServers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedMcps, setExpandedMcps] = useState(new Set());
  const [filter, setFilter] = useState('all'); // 'all', 'third-party', 'custom'
  const [searchQuery, setSearchQuery] = useState('');
  const { token } = useAuth();
  const { terminalLogs } = useTerminal();

  useEffect(() => {
    fetchMcpServers();
  }, []);

  const fetchMcpServers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/tools/mcp-servers', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setMcpServers(data.mcpServers || []);
        setSummary(data.summary || null);
        setError('');
      } else {
        setError(data.message || 'Failed to load MCP servers');
      }
    } catch (err) {
      setError('Failed to load MCP servers. Please try again.');
      console.error('[Tools] Error fetching MCP servers:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpanded = (mcpKey) => {
    const newExpanded = new Set(expandedMcps);
    if (newExpanded.has(mcpKey)) {
      newExpanded.delete(mcpKey);
    } else {
      newExpanded.add(mcpKey);
    }
    setExpandedMcps(newExpanded);
  };

  const getTypeClass = (type) => {
    const classes = {
      'third-party': 'type-third-party',
      'custom': 'type-custom',
      'http': 'type-http'
    };
    return classes[type] || 'type-unknown';
  };

  const formatLogMessage = (log) => {
    const time = new Date(log.timestamp).toLocaleTimeString();
    return `[${time}] ${log.stage ? `[${log.stage}] ` : ''}${log.message}`;
  };

  const displayLogs = terminalLogs.slice(-4);

  // Filter MCP servers
  const filteredMcps = mcpServers.filter(mcp => {
    // Apply type filter
    if (filter === 'third-party' && mcp.type !== 'third-party' && mcp.type !== 'http') return false;
    if (filter === 'custom' && mcp.type !== 'custom') return false;

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        mcp.name.toLowerCase().includes(query) ||
        mcp.description.toLowerCase().includes(query) ||
        mcp.functions.some(f =>
          f.name.toLowerCase().includes(query) ||
          f.description.toLowerCase().includes(query)
        )
      );
    }

    return true;
  });

  return (
    <div className="tools-container">
      <div className="terminal">
        {displayLogs.length === 0 ? (
          <>
            <div>&gt; MCP Server Catalog</div>
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
      <div className="tools-content">
        <div className="tools-header">
          <h1>Tools</h1>
          <p className="tools-subtitle">
            MCP (Model Context Protocol) servers extend agents with external capabilities
          </p>
        </div>

        {summary && (
          <div className="tools-summary">
            <div className="summary-stat">
              <div className="stat-value">{summary.totalMcps}</div>
              <div className="stat-label">Total MCPs</div>
            </div>
            <div className="summary-stat">
              <div className="stat-value">{summary.totalFunctions}</div>
              <div className="stat-label">Total Functions</div>
            </div>
            <div className="summary-stat">
              <div className="stat-value">{summary.thirdParty + summary.http}</div>
              <div className="stat-label">Third-Party</div>
            </div>
            <div className="summary-stat">
              <div className="stat-value">{summary.custom}</div>
              <div className="stat-label">Custom Built</div>
            </div>
            <div className="summary-stat">
              <div className="stat-value">{summary.oauthConnected}/{summary.oauthRequired}</div>
              <div className="stat-label">OAuth Connected</div>
            </div>
          </div>
        )}

        <div className="tools-controls">
          <div className="filter-buttons">
            <button
              className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All
            </button>
            <button
              className={`filter-btn ${filter === 'third-party' ? 'active' : ''}`}
              onClick={() => setFilter('third-party')}
            >
              Third-Party
            </button>
            <button
              className={`filter-btn ${filter === 'custom' ? 'active' : ''}`}
              onClick={() => setFilter('custom')}
            >
              Custom
            </button>
          </div>
          <input
            type="text"
            className="search-input"
            placeholder="Search MCPs or functions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {loading ? (
          <div className="loading">Loading MCP servers...</div>
        ) : (
          <>
            <div className="mcps-list">
              {filteredMcps.length === 0 ? (
                <div className="empty-state">
                  <p>No MCP servers found matching your search.</p>
                </div>
              ) : (
                filteredMcps.map(mcp => {
                  const isExpanded = expandedMcps.has(mcp.key);

                  return (
                    <div
                      key={mcp.key}
                      className={`mcp-card ${isExpanded ? 'expanded' : ''}`}
                    >
                      <div
                        className="mcp-header"
                        onClick={() => toggleExpanded(mcp.key)}
                      >
                        <div className="mcp-header-left">
                          <div className="mcp-title-section">
                            <h3 className="mcp-name">{mcp.name}</h3>
                            <div className="mcp-meta">
                              <span className={`mcp-type ${getTypeClass(mcp.type)}`}>
                                {mcp.type}
                              </span>
                              <span className="mcp-functions">
                                {mcp.totalFunctions} functions
                              </span>
                              {mcp.oauthRequired && (
                                <span className={`oauth-status ${mcp.oauthConnected ? 'connected' : 'disconnected'}`}>
                                  {mcp.oauthConnected ? '🟢 OAuth Connected' : '🔴 OAuth Required'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <span className="expand-indicator">
                          {isExpanded ? '−' : '+'}
                        </span>
                      </div>

                      {!isExpanded && (
                        <div className="mcp-summary">
                          <p className="mcp-description">{mcp.description}</p>
                        </div>
                      )}

                      {isExpanded && (
                        <div className="mcp-details">
                          <div className="mcp-section">
                            <div className="section-label">Description</div>
                            <p className="mcp-description">{mcp.description}</p>
                          </div>

                          <div className="mcp-section">
                            <div className="section-label">Package</div>
                            <code className="mcp-package">{mcp.package}</code>
                          </div>

                          {mcp.usedByAgents && mcp.usedByAgents.length > 0 && (
                            <div className="mcp-section">
                              <div className="section-label">Used By Agents</div>
                              <div className="agents-list">
                                {mcp.usedByAgents.map(agent => (
                                  <span key={agent.id} className="agent-badge">
                                    {agent.name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="mcp-section">
                            <div className="section-label">Available Functions ({mcp.totalFunctions})</div>
                            <div className="functions-list">
                              {mcp.functions.map((func, idx) => (
                                <div key={idx} className="function-item">
                                  <div className="function-header">
                                    <code className="function-name">{func.name}</code>
                                  </div>
                                  <div className="function-description">{func.description}</div>
                                  {func.params && (
                                    <div className="function-params">
                                      <strong>Parameters:</strong> {func.params}
                                    </div>
                                  )}
                                </div>
                              ))}
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

export default Tools;
