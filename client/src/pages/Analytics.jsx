import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTerminal } from '../contexts/TerminalContext';
import Navbar from '../components/Navbar';
import './Analytics.css';

function Analytics() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { token } = useAuth();
  const { terminalLogs } = useTerminal();

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const response = await fetch('/api/documents', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setAnalytics(data.documents?.analytics_json || null);
      } else {
        setError(data.message || 'Failed to load analytics');
      }
    } catch (err) {
      setError('Failed to load analytics. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatLogMessage = (log) => {
    const time = new Date(log.timestamp).toLocaleTimeString();
    return `[${time}] ${log.stage ? `[${log.stage}] ` : ''}${log.message}`;
  };

  const displayLogs = terminalLogs.slice(-5);

  const formatValue = (value, key) => {
    if (value === null || value === undefined) {
      return 'N/A';
    }

    // Format currency values
    if (key.includes('usd') || key.includes('cost') || key.includes('revenue') || key.includes('spend')) {
      return `$${typeof value === 'number' ? value.toFixed(2) : value}`;
    }

    // Format ROAS with 2 decimals
    if (key === 'roas') {
      return typeof value === 'number' ? value.toFixed(2) : value;
    }

    // Format large numbers with commas
    if (typeof value === 'number' && value >= 1000) {
      return value.toLocaleString();
    }

    return value;
  };

  const getMetricsByCategory = () => {
    if (!analytics) return {};

    return {
      'Product Metrics': [
        { key: 'active_users', label: 'Active Users', value: analytics.active_users },
        { key: 'new_users_this_week', label: 'New Users (This Week)', value: analytics.new_users_this_week },
        { key: 'app_downloads', label: 'App Downloads', value: analytics.app_downloads },
        { key: 'active_devices', label: 'Active Devices', value: analytics.active_devices },
      ],
      'Revenue & Marketing': [
        { key: 'app_revenue_usd', label: 'App Revenue', value: analytics.app_revenue_usd },
        { key: 'ad_spend_usd', label: 'Ad Spend (7d)', value: analytics.ad_spend_usd },
        { key: 'roas', label: 'ROAS', value: analytics.roas },
        { key: 'active_campaigns', label: 'Active Campaigns', value: analytics.active_campaigns },
        { key: 'ad_impressions', label: 'Ad Impressions', value: analytics.ad_impressions },
        { key: 'ad_clicks', label: 'Ad Clicks', value: analytics.ad_clicks },
      ],
      'Product Health': [
        { key: 'critical_bugs', label: 'Critical Bugs', value: analytics.critical_bugs },
        { key: 'total_bugs', label: 'Total Bugs', value: analytics.total_bugs },
        { key: 'sentry_projects', label: 'Sentry Projects', value: analytics.sentry_projects },
      ],
      'Infrastructure & Operations': [
        { key: 'module_executions_7d', label: 'Module Executions (7d)', value: analytics.module_executions_7d },
        { key: 'ai_cost_usd_7d', label: 'AI Cost (7d)', value: analytics.ai_cost_usd_7d },
        { key: 'slack_messages_analyzed', label: 'Slack Messages Analyzed', value: analytics.slack_messages_analyzed },
      ],
      'Team Activity': [
        { key: 'slack_blockers', label: 'Blockers', value: analytics.slack_blockers },
        { key: 'slack_action_items', label: 'Action Items', value: analytics.slack_action_items },
        { key: 'urgent_emails', label: 'Urgent Emails', value: analytics.urgent_emails },
        { key: 'important_emails', label: 'Important Emails', value: analytics.important_emails },
        { key: 'unread_emails', label: 'Unread Emails', value: analytics.unread_emails },
      ],
    };
  };

  const getStatusColor = (key, value) => {
    if (value === null || value === undefined) return '';

    // Critical bugs - red if > 0
    if (key === 'critical_bugs' && value > 0) return 'metric-warning';

    // Total bugs - warning if > 10
    if (key === 'total_bugs' && value > 10) return 'metric-warning';

    // ROAS - good if > 2.0
    if (key === 'roas' && value >= 2.0) return 'metric-good';

    // Growth metrics - good if > 0
    if (key === 'new_users_this_week' && value > 0) return 'metric-good';

    return '';
  };

  return (
    <div className="analytics-container">
      <div className="terminal">
        {displayLogs.length === 0 ? (
          <>
            <div>&gt; Business Analytics Dashboard</div>
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

      <div className="analytics-content">
        {loading && (
          <div className="status-message">
            <p>Loading analytics...</p>
          </div>
        )}

        {error && !loading && (
          <div className="status-message error">
            <p>{error}</p>
          </div>
        )}

        {!loading && !analytics && !error && (
          <div className="status-message">
            <p>No analytics data available. Run the "All Analytics" module to generate your dashboard.</p>
          </div>
        )}

        {!loading && analytics && (
          <>
            <div className="analytics-header">
              <h1>📊 Business Analytics</h1>
              <p className="analytics-subtitle">
                Real-time business metrics from all connected sources
              </p>
              {analytics.timestamp && (
                <p className="analytics-timestamp">
                  Last updated: {new Date(analytics.timestamp).toLocaleString()}
                </p>
              )}
            </div>

            {Object.entries(getMetricsByCategory()).map(([category, metrics]) => (
              <div key={category} className="metrics-category">
                <h2 className="category-title">{category}</h2>
                <div className="metrics-grid">
                  {metrics.map(({ key, label, value }) => (
                    <div key={key} className={`metric-card ${getStatusColor(key, value)}`}>
                      <div className="metric-label">{label}</div>
                      <div className="metric-value">{formatValue(value, key)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className="analytics-footer">
              <button className="refresh-button" onClick={fetchAnalytics}>
                Refresh Data
              </button>
            </div>
          </>
        )}
      </div>

      <footer className="analytics-footer">
        <p className="analytics-footer-contact">Contact: <a href="mailto:system@polsia.ai">system@polsia.ai</a></p>
      </footer>
    </div>
  );
}

export default Analytics;
