/**
 * Data Agent Service
 * Collects metrics from all active integrations and updates analytics documents
 */

const { pool } = require('../db');
const db = require('../db');
const { updateDocument, appendToMemory } = require('./document-store');

/**
 * Collect metrics from all active integrations for a user
 * @param {number} userId - User ID
 * @returns {Promise<object>} - Collected metrics from all services
 */
async function collectMetrics(userId) {
  console.log(`📊 [Data Agent] Collecting metrics for user ${userId}...`);

  const metrics = {
    timestamp: new Date().toISOString(),
    github: null,
    gmail: null,
    meta_ads: null,
    render: null,
    late_dev: null,
    modules: null,
  };

  try {
    // Get connected services
    const connections = await db.getServiceConnectionsByUserId(userId);
    const connectedServices = connections.filter(c => c.status === 'connected');

    // Collect GitHub metrics
    if (connectedServices.some(c => c.service_name === 'github')) {
      metrics.github = await collectGitHubMetrics(userId);
    }

    // Collect Gmail metrics
    if (connectedServices.some(c => c.service_name === 'gmail')) {
      metrics.gmail = await collectGmailMetrics(userId);
    }

    // Collect Meta Ads metrics
    if (connectedServices.some(c => c.service_name === 'meta_ads')) {
      metrics.meta_ads = await collectMetaAdsMetrics(userId);
    }

    // Collect social media metrics (Late.dev)
    if (connectedServices.some(c => c.service_name === 'instagram')) {
      metrics.late_dev = await collectSocialMediaMetrics(userId);
    }

    // Collect module execution metrics
    metrics.modules = await collectModuleMetrics(userId);

    console.log(`✅ [Data Agent] Metrics collected successfully`);
    return metrics;
  } catch (error) {
    console.error('❌ [Data Agent] Error collecting metrics:', error);
    throw error;
  }
}

/**
 * Collect GitHub metrics (commits, PRs, issues)
 */
async function collectGitHubMetrics(userId) {
  const client = await pool.connect();
  try {
    // Get recent module executions that used GitHub
    const result = await client.query(
      `SELECT me.metadata, me.completed_at
       FROM module_executions me
       JOIN modules m ON me.module_id = m.id
       WHERE m.user_id = $1
         AND me.status = 'completed'
         AND me.completed_at > NOW() - INTERVAL '7 days'
         AND (m.config->>'mcpMounts')::text LIKE '%github%'
       ORDER BY me.completed_at DESC
       LIMIT 20`,
      [userId]
    );

    return {
      recent_activity_count: result.rows.length,
      last_activity: result.rows[0]?.completed_at || null,
    };
  } catch (error) {
    console.error('Error collecting GitHub metrics:', error);
    return { error: error.message };
  } finally {
    client.release();
  }
}

/**
 * Collect Gmail metrics (unread count, recent emails)
 */
async function collectGmailMetrics(userId) {
  const client = await pool.connect();
  try {
    // Get recent email summarizer executions
    const result = await client.query(
      `SELECT me.metadata, me.completed_at
       FROM module_executions me
       JOIN modules m ON me.module_id = m.id
       WHERE m.user_id = $1
         AND m.type = 'email_summarizer'
         AND me.status = 'completed'
         AND me.completed_at > NOW() - INTERVAL '7 days'
       ORDER BY me.completed_at DESC
       LIMIT 10`,
      [userId]
    );

    return {
      summarizer_runs: result.rows.length,
      last_check: result.rows[0]?.completed_at || null,
    };
  } catch (error) {
    console.error('Error collecting Gmail metrics:', error);
    return { error: error.message };
  } finally {
    client.release();
  }
}

/**
 * Collect Meta Ads metrics (campaign performance)
 */
async function collectMetaAdsMetrics(userId) {
  const client = await pool.connect();
  try {
    // Get Meta Ads connection metadata (may contain campaign info)
    const result = await client.query(
      `SELECT metadata
       FROM service_connections
       WHERE user_id = $1 AND service_name = 'meta_ads' AND status = 'connected'
       LIMIT 1`,
      [userId]
    );

    return {
      connected: result.rows.length > 0,
      metadata: result.rows[0]?.metadata || null,
    };
  } catch (error) {
    console.error('Error collecting Meta Ads metrics:', error);
    return { error: error.message };
  } finally {
    client.release();
  }
}

/**
 * Collect social media metrics (Late.dev)
 */
async function collectSocialMediaMetrics(userId) {
  const client = await pool.connect();
  try {
    // Get recent content posts (join through social_accounts and profiles to get user_id)
    const contentResult = await client.query(
      `SELECT c.status, sa.platform, c.created_at
       FROM content c
       JOIN social_accounts sa ON c.account_id = sa.id
       JOIN profiles p ON sa.profile_id = p.id
       WHERE p.user_id = $1
         AND c.created_at > NOW() - INTERVAL '7 days'
       ORDER BY c.created_at DESC
       LIMIT 20`,
      [userId]
    );

    const statuses = contentResult.rows.reduce((acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, {});

    return {
      posts_last_7_days: contentResult.rows.length,
      post_statuses: statuses,
      last_post: contentResult.rows[0]?.created_at || null,
    };
  } catch (error) {
    console.error('Error collecting social media metrics:', error);
    return { error: error.message };
  } finally {
    client.release();
  }
}

/**
 * Collect module execution metrics
 */
async function collectModuleMetrics(userId) {
  const client = await pool.connect();
  try {
    // Get module execution stats for last 7 days
    const result = await client.query(
      `SELECT
         m.name,
         m.type,
         COUNT(me.id) as execution_count,
         COUNT(CASE WHEN me.status = 'completed' THEN 1 END) as successful_count,
         COUNT(CASE WHEN me.status = 'failed' THEN 1 END) as failed_count,
         SUM(me.cost_usd) as total_cost,
         AVG(me.duration_ms) as avg_duration_ms
       FROM modules m
       LEFT JOIN module_executions me ON m.id = me.module_id
         AND me.started_at > NOW() - INTERVAL '7 days'
       WHERE m.user_id = $1 AND m.status = 'active'
       GROUP BY m.id, m.name, m.type
       ORDER BY execution_count DESC`,
      [userId]
    );

    const totalExecutions = result.rows.reduce((sum, row) => sum + parseInt(row.execution_count || 0), 0);
    const totalCost = result.rows.reduce((sum, row) => sum + parseFloat(row.total_cost || 0), 0);
    const totalFailed = result.rows.reduce((sum, row) => sum + parseInt(row.failed_count || 0), 0);

    return {
      active_modules: result.rows.length,
      total_executions: totalExecutions,
      total_cost_usd: parseFloat(totalCost.toFixed(4)),
      total_failed: totalFailed,
      modules: result.rows.map(row => ({
        name: row.name,
        type: row.type,
        executions: parseInt(row.execution_count || 0),
        success: parseInt(row.successful_count || 0),
        failed: parseInt(row.failed_count || 0),
        cost: parseFloat(parseFloat(row.total_cost || 0).toFixed(4)),
        avg_duration_ms: parseInt(row.avg_duration_ms || 0),
      })),
    };
  } catch (error) {
    console.error('Error collecting module metrics:', error);
    return { error: error.message };
  } finally {
    client.release();
  }
}

/**
 * Generate analytics summary in markdown format
 * @param {object} metrics - Collected metrics
 * @returns {string} - Markdown formatted analytics summary
 */
function generateAnalyticsSummary(metrics) {
  const timestamp = new Date().toISOString();
  let summary = `# Analytics Summary\n\nLast updated: ${timestamp}\n\n`;

  // Module Execution Summary
  if (metrics.modules && !metrics.modules.error) {
    summary += `## Module Execution Summary (Last 7 Days)\n\n`;
    summary += `- **Active Modules**: ${metrics.modules.active_modules || 0}\n`;
    summary += `- **Total Executions**: ${metrics.modules.total_executions || 0}\n`;
    summary += `- **Failed Executions**: ${metrics.modules.total_failed || 0}\n`;
    summary += `- **Total Cost**: $${(metrics.modules.total_cost_usd || 0).toFixed(4)}\n\n`;

    if (metrics.modules.modules && metrics.modules.modules.length > 0) {
      summary += `### Module Breakdown\n\n`;
      metrics.modules.modules.forEach(module => {
        summary += `- **${module.name}** (${module.type}): ${module.executions || 0} executions, ${module.failed || 0} failed, $${(module.cost || 0).toFixed(4)}\n`;
      });
      summary += `\n`;
    }
  }

  // GitHub Summary
  if (metrics.github && !metrics.github.error) {
    summary += `## GitHub Activity\n\n`;
    summary += `- **Recent Activities**: ${metrics.github.recent_activity_count || 0}\n`;
    summary += `- **Last Activity**: ${metrics.github.last_activity || 'N/A'}\n\n`;
  }

  // Gmail Summary
  if (metrics.gmail && !metrics.gmail.error) {
    summary += `## Email Activity\n\n`;
    summary += `- **Email Summarizer Runs**: ${metrics.gmail.summarizer_runs || 0}\n`;
    summary += `- **Last Check**: ${metrics.gmail.last_check || 'N/A'}\n\n`;
  }

  // Social Media Summary
  if (metrics.late_dev && !metrics.late_dev.error) {
    summary += `## Social Media Activity\n\n`;
    summary += `- **Posts (Last 7 Days)**: ${metrics.late_dev.posts_last_7_days || 0}\n`;
    summary += `- **Last Post**: ${metrics.late_dev.last_post || 'N/A'}\n`;
    if (metrics.late_dev.post_statuses && Object.keys(metrics.late_dev.post_statuses).length > 0) {
      summary += `- **Post Statuses**: ${JSON.stringify(metrics.late_dev.post_statuses)}\n`;
    }
    summary += `\n`;
  }

  // Meta Ads Summary
  if (metrics.meta_ads && !metrics.meta_ads.error) {
    summary += `## Meta Ads\n\n`;
    summary += `- **Status**: ${metrics.meta_ads.connected ? 'Connected' : 'Not Connected'}\n\n`;
  }

  return summary;
}

/**
 * Generate analytics JSON (structured data)
 * @param {object} metrics - Collected metrics
 * @returns {object} - Structured analytics data
 */
function generateAnalyticsJSON(metrics) {
  const modulesData = metrics.modules && !metrics.modules.error ? metrics.modules : null;

  return {
    timestamp: metrics.timestamp,
    summary: {
      active_modules: modulesData?.active_modules || 0,
      total_executions: modulesData?.total_executions || 0,
      total_failed: modulesData?.total_failed || 0,
      total_cost_usd: modulesData?.total_cost_usd || 0,
    },
    services: {
      github: (metrics.github && !metrics.github.error) ? metrics.github : {},
      gmail: (metrics.gmail && !metrics.gmail.error) ? metrics.gmail : {},
      meta_ads: (metrics.meta_ads && !metrics.meta_ads.error) ? metrics.meta_ads : {},
      late_dev: (metrics.late_dev && !metrics.late_dev.error) ? metrics.late_dev : {},
    },
    modules: modulesData || {},
  };
}

/**
 * Detect anomalies in metrics and return notable events
 * @param {object} metrics - Collected metrics
 * @returns {string|null} - Memory entry for anomalies, or null if none
 */
function detectAnomalies(metrics) {
  const anomalies = [];

  // Check for high failure rate
  if (metrics.modules && !metrics.modules.error && metrics.modules.total_executions > 0) {
    const failureRate = metrics.modules.total_failed / metrics.modules.total_executions;
    if (failureRate > 0.3) {
      anomalies.push(`⚠️ High failure rate detected: ${(failureRate * 100).toFixed(1)}% of executions failed in the last 7 days`);
    }
  }

  // Check for high costs
  if (metrics.modules && !metrics.modules.error && metrics.modules.total_cost_usd > 1.0) {
    anomalies.push(`💰 Significant AI costs: $${metrics.modules.total_cost_usd.toFixed(2)} spent in the last 7 days`);
  }

  // Check for inactive modules
  if (metrics.modules && !metrics.modules.error && metrics.modules.active_modules > 0 && metrics.modules.total_executions === 0) {
    anomalies.push(`⏸️ No module executions in the last 7 days despite having ${metrics.modules.active_modules} active modules`);
  }

  if (anomalies.length > 0) {
    return `### Data Agent Anomaly Report\n\n` + anomalies.join('\n');
  }

  return null;
}

/**
 * Run the full data agent cycle: collect metrics, update analytics, detect anomalies
 * @param {number} userId - User ID
 * @returns {Promise<object>} - Result summary
 */
async function runDataAgent(userId) {
  console.log(`🤖 [Data Agent] Running for user ${userId}...`);

  try {
    // 1. Collect metrics from all integrations
    const metrics = await collectMetrics(userId);

    // 2. Generate analytics summary (markdown)
    const analyticsMd = generateAnalyticsSummary(metrics);

    // 3. Generate analytics JSON (structured data)
    const analyticsJson = generateAnalyticsJSON(metrics);

    // 4. Update analytics documents
    await updateDocument(userId, 'analytics_md', analyticsMd);
    await updateDocument(userId, 'analytics_json', analyticsJson);

    // 5. Detect anomalies and add to memory if found
    const anomalies = detectAnomalies(metrics);
    if (anomalies) {
      await appendToMemory(userId, anomalies);
    }

    console.log(`✅ [Data Agent] Completed successfully for user ${userId}`);

    return {
      success: true,
      metrics,
      analytics_updated: true,
      anomalies_detected: !!anomalies,
    };
  } catch (error) {
    console.error(`❌ [Data Agent] Error running for user ${userId}:`, error);
    throw error;
  }
}

module.exports = {
  collectMetrics,
  generateAnalyticsSummary,
  generateAnalyticsJSON,
  detectAnomalies,
  runDataAgent,
};
