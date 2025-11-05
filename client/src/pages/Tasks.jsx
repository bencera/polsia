import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTerminal } from '../contexts/TerminalContext';
import Navbar from '../components/Navbar';
import './Tasks.css';

function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedTasks, setExpandedTasks] = useState(new Set());
  const { token } = useAuth();
  const { terminalLogs } = useTerminal();

  useEffect(() => {
    fetchTasks();
  }, [statusFilter]);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const url = statusFilter
        ? `/api/tasks?status=${statusFilter}`
        : '/api/tasks';

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        // Filter out completed tasks
        const nonCompletedTasks = data.tasks.filter(
          task => task.status !== 'completed'
        );
        setTasks(nonCompletedTasks);
        setError('');
      } else {
        setError(data.message || 'Failed to load tasks');
      }
    } catch (err) {
      setError('Failed to load tasks. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (taskId) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}/approve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        fetchTasks(); // Refresh list
      } else {
        const data = await response.json();
        setError(data.message || 'Failed to approve task');
      }
    } catch (err) {
      setError('Failed to approve task. Please try again.');
    }
  };

  const handleReject = async (taskId) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}/reject`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        fetchTasks(); // Refresh list
      } else {
        const data = await response.json();
        setError(data.message || 'Failed to reject task');
      }
    } catch (err) {
      setError('Failed to reject task. Please try again.');
    }
  };

  const handleStatusUpdate = async (taskId, newStatus) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (response.ok) {
        fetchTasks(); // Refresh list
      } else {
        const data = await response.json();
        setError(data.message || 'Failed to update task status');
      }
    } catch (err) {
      setError('Failed to update task status. Please try again.');
    }
  };

  const formatTimeAgo = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);

    if (seconds < 60) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    if (weeks < 4) return `${weeks}w ago`;
    return date.toLocaleDateString();
  };

  const toggleExpanded = (taskId) => {
    const newExpanded = new Set(expandedTasks);
    if (newExpanded.has(taskId)) {
      newExpanded.delete(taskId);
    } else {
      newExpanded.add(taskId);
    }
    setExpandedTasks(newExpanded);
  };

  const getStatusColor = (status) => {
    const colors = {
      suggested: '#3b82f6',
      approved: '#10b981',
      in_progress: '#f59e0b',
      waiting: '#6b7280',
      blocked: '#ef4444',
      rejected: '#991b1b',
      failed: '#dc2626'
    };
    return colors[status] || '#6b7280';
  };

  const getPriorityColor = (priority) => {
    const colors = {
      critical: '#dc2626',
      high: '#f59e0b',
      medium: '#3b82f6',
      low: '#6b7280'
    };
    return colors[priority] || '#6b7280';
  };

  // Format log for terminal display
  const formatLogMessage = (log) => {
    const time = new Date(log.timestamp).toLocaleTimeString();
    return `[${time}] ${log.stage ? `[${log.stage}] ` : ''}${log.message}`;
  };

  // Get last 4 logs for terminal display
  const displayLogs = terminalLogs.slice(-4);

  return (
    <div className="tasks-container">
      <div className="terminal">
        {displayLogs.length === 0 ? (
          <>
            <div>&gt; Task Management System</div>
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

      <div className="tasks-content">
        <div className="tasks-header">
          <h1>Tasks</h1>
          <div className="tasks-filter">
            <label htmlFor="status-filter">Filter by Status:</label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="status-filter-select"
            >
              <option value="">All</option>
              <option value="suggested">Suggested</option>
              <option value="approved">Approved</option>
              <option value="in_progress">In Progress</option>
              <option value="waiting">Waiting</option>
              <option value="blocked">Blocked</option>
              <option value="rejected">Rejected</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>

        {loading && (
          <div className="status-message">
            <p>Loading tasks...</p>
          </div>
        )}

        {error && (
          <div className="status-message error">
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && tasks.length === 0 && (
          <div className="status-message">
            <p>No {statusFilter ? statusFilter.replace('_', ' ') : 'non-completed'} tasks found.</p>
          </div>
        )}

        {!loading && !error && tasks.length > 0 && (
          <div className="tasks-list">
            {tasks.map((task) => {
              const isExpanded = expandedTasks.has(task.id);

              return (
                <div key={task.id} className={`task-card ${isExpanded ? 'expanded' : ''}`}>
                  {/* Collapsed view - one liner */}
                  <div
                    className="task-header-collapsed"
                    onClick={() => toggleExpanded(task.id)}
                  >
                    <div className="task-title-row">
                      <h3 className="task-title">
                        #{task.id} {task.title}
                      </h3>
                      <div className="task-badges">
                        <span
                          className="status-badge"
                          style={{ backgroundColor: getStatusColor(task.status), color: '#fff' }}
                        >
                          {task.status.replace('_', ' ')}
                        </span>
                        {task.priority && (
                          <span
                            className="priority-badge"
                            style={{ backgroundColor: getPriorityColor(task.priority), color: '#fff' }}
                          >
                            {task.priority}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded view - full details */}
                  {isExpanded && (
                    <>
                      <div className="task-meta">
                        <span className="task-timestamp">Created {formatTimeAgo(task.created_at)}</span>
                        {task.started_at && (
                          <span className="task-timestamp"> • Started {formatTimeAgo(task.started_at)}</span>
                        )}
                      </div>

                      <div className="task-body">
                        {task.suggestion_reasoning && (
                          <div className="task-reasoning">
                            <div className="reasoning-label">💡 Suggested Reasoning</div>
                            <div className="reasoning-content">{task.suggestion_reasoning}</div>
                          </div>
                        )}

                        {task.description && (
                          <div className="task-description">
                            <div className="description-label">Description</div>
                            <p>{task.description}</p>
                          </div>
                        )}

                        {task.blocked_reason && (
                          <div className="task-blocked-reason">
                            <strong>⚠️ Blocked:</strong> {task.blocked_reason}
                          </div>
                        )}

                        {(task.proposed_by_module_id || task.assigned_to_module_id) && (
                          <div className="task-modules">
                            {task.proposed_by_module_id && (
                              <span className="module-info">Proposed by Module #{task.proposed_by_module_id}</span>
                            )}
                            {task.assigned_to_module_id && (
                              <span className="module-info">Assigned to Module #{task.assigned_to_module_id}</span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="task-actions">
                        {task.status === 'suggested' && (
                          <>
                            <button
                              className="action-btn approve-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleApprove(task.id);
                              }}
                            >
                              ✓ Approve
                            </button>
                            <button
                              className="action-btn reject-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReject(task.id);
                              }}
                            >
                              ✗ Reject
                            </button>
                          </>
                        )}

                        {task.status !== 'suggested' && task.status !== 'rejected' && task.status !== 'failed' && (
                          <div className="status-update-group">
                            <label htmlFor={`status-update-${task.id}`}>Update Status:</label>
                            <select
                              id={`status-update-${task.id}`}
                              className="status-update-select"
                              value={task.status}
                              onChange={(e) => {
                                e.stopPropagation();
                                handleStatusUpdate(task.id, e.target.value);
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <option value="approved">Approved</option>
                              <option value="in_progress">In Progress</option>
                              <option value="waiting">Waiting</option>
                              <option value="blocked">Blocked</option>
                              <option value="completed">Completed</option>
                            </select>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default Tasks;
