import { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { useTerminal } from '../contexts/TerminalContext';
import './Modules.css';

function Modules() {
  const { token } = useAuth();
  const { terminalLogs, runModule, isStreaming } = useTerminal();
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [runningModules, setRunningModules] = useState(new Set());

  // Fetch modules from API
  useEffect(() => {
    fetchModules();
  }, [token]);

  const fetchModules = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/modules', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch modules');
      }

      const data = await response.json();
      setModules(data.modules || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching modules:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleModuleStatus = async (moduleId, currentStatus) => {
    try {
      const newStatus = currentStatus === 'active' ? 'disabled' : 'active';

      const response = await fetch(`/api/modules/${moduleId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (!response.ok) {
        throw new Error('Failed to update module status');
      }

      const data = await response.json();

      // Update local state
      setModules(modules.map(module =>
        module.id === moduleId ? data.module : module
      ));
    } catch (err) {
      console.error('Error toggling module status:', err);
      alert('Failed to update module status');
    }
  };

  const updateFrequency = async (moduleId, frequency) => {
    try {
      const response = await fetch(`/api/modules/${moduleId}`, {
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
      setModules(modules.map(module =>
        module.id === moduleId ? data.module : module
      ));
    } catch (err) {
      console.error('Error updating frequency:', err);
      alert('Failed to update frequency');
    }
  };

  const updateGuardrails = async (moduleId, guardrail, value) => {
    try {
      const module = modules.find(m => m.id === moduleId);
      const newConfig = {
        ...module.config,
        guardrails: {
          ...module.config?.guardrails,
          [guardrail]: value
        }
      };

      const response = await fetch(`/api/modules/${moduleId}`, {
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
      setModules(modules.map(m =>
        m.id === moduleId ? data.module : m
      ));
    } catch (err) {
      console.error('Error updating guardrails:', err);
      alert('Failed to update guardrails');
    }
  };

  const runModuleNow = async (moduleId, moduleName) => {
    if (!confirm(`Run "${moduleName}" now?`)) {
      return;
    }

    // Mark module as running
    setRunningModules(prev => new Set([...prev, moduleId]));

    // Use context's runModule function
    const success = await runModule(moduleId, moduleName);

    if (!success) {
      alert('Failed to run module');
      setRunningModules(prev => {
        const newSet = new Set(prev);
        newSet.delete(moduleId);
        return newSet;
      });
    }
  };

  const activeCount = modules.filter(m => m.status === 'active').length;

  if (loading) {
    return (
      <div className="modules-container">
        <div className="terminal">
          <span>&gt; Autonomous Operations Control</span>
        </div>
        <Navbar />
        <div className="modules-content">
          <p style={{ textAlign: 'center', marginTop: '40px' }}>Loading modules...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="modules-container">
        <div className="terminal">
          <span>&gt; Autonomous Operations Control</span>
        </div>
        <Navbar />
        <div className="modules-content">
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
    <div className="modules-container">
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

      <div className="modules-content">
        <div className="modules-header">
          <h2>Modules</h2>
          <p className="modules-subtitle">
            Active modules will run automatically based on their frequency.
            You can adjust settings or disable specific modules.
          </p>
          <p className="modules-status">
            {activeCount} {activeCount === 1 ? 'module' : 'modules'} active
          </p>
        </div>

        {modules.length === 0 ? (
          <div style={{ textAlign: 'center', marginTop: '40px', color: '#666' }}>
            <p>No modules created yet.</p>
            <p style={{ fontSize: '14px', marginTop: '10px' }}>
              Modules will appear here once created via the API.
            </p>
          </div>
        ) : (
          <div className="modules-list">
            {modules.map((module) => (
              <div key={module.id} className="module-card">
                <div className="module-main">
                  <div className="module-info">
                    <h3 className={`module-name ${module.status !== 'active' ? 'disabled' : ''}`}>
                      {module.name}
                    </h3>
                    <p className={`module-description ${module.status !== 'active' ? 'disabled' : ''}`}>
                      {module.description}
                    </p>

                    <div className="module-meta">
                      <span className={`module-status ${module.status}`}>
                        {module.status}
                      </span>
                      <span className="module-type">
                        Type: {module.type}
                      </span>
                    </div>
                  </div>

                  <div className="module-controls">
                    <button
                      className="toggle-status-btn"
                      onClick={() => toggleModuleStatus(module.id, module.status)}
                    >
                      {module.status === 'active' ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      className="run-now-btn"
                      onClick={() => runModuleNow(module.id, module.name)}
                      disabled={runningModules.has(module.id)}
                    >
                      {runningModules.has(module.id) ? 'Running...' : 'Run Now'}
                    </button>
                    <select
                      className="module-frequency-select"
                      value={module.frequency}
                      onChange={(e) => updateFrequency(module.id, e.target.value)}
                    >
                      <option value="auto">AUTO</option>
                      <option value="daily">DAILY</option>
                      <option value="weekly">WEEKLY</option>
                      <option value="manual">MANUAL</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <footer className="footer">
        <p className="footer-contact">Contact: <a href="mailto:system@polsia.ai">system@polsia.ai</a></p>
      </footer>
    </div>
  );
}

export default Modules;
