/**
 * Brain Routes
 * RESTful API endpoints for Brain orchestrator status and control
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const {
  runBrainCycle,
  getLastBrainDecision,
} = require('../services/brain-orchestrator');

// Note: All routes require authenticateToken middleware (applied in server.js)
// req.user is available in all routes

/**
 * GET /api/brain/status
 * Get current Brain status for the authenticated user
 */
router.get('/status', async (req, res) => {
  try {
    const lastDecision = await getLastBrainDecision(req.user.id);

    if (!lastDecision) {
      return res.json({
        success: true,
        status: 'never_run',
        message: 'Brain has never run for this user',
        last_decision: null,
      });
    }

    res.json({
      success: true,
      status: 'active',
      last_decision: {
        id: lastDecision.id,
        action: lastDecision.action_description,
        reasoning: lastDecision.decision_reasoning,
        module_name: lastDecision.module_name,
        module_id: lastDecision.module_id,
        priority: lastDecision.priority,
        execution_status: lastDecision.execution_status,
        execution_id: lastDecision.execution_id,
        created_at: lastDecision.created_at,
        metadata: lastDecision.metadata,
      },
    });
  } catch (error) {
    console.error('Error getting Brain status:', error);
    res.status(500).json({ success: false, message: 'Failed to get Brain status' });
  }
});

/**
 * POST /api/brain/trigger
 * Manually trigger a Brain cycle
 */
router.post('/trigger', async (req, res) => {
  try {
    console.log(`🧠 [API] Manual Brain trigger requested by user ${req.user.id}`);

    // Run Brain cycle (async, but wait for result)
    const result = await runBrainCycle(req.user.id);

    if (result.success) {
      res.json({
        success: true,
        message: 'Brain cycle completed successfully',
        decision: {
          action: result.decision.action,
          reasoning: result.decision.reasoning,
          module_id: result.decision.module_id,
          priority: result.decision.priority_level,
        },
        execution: {
          execution_id: result.execution_result.execution_id,
          success: result.execution_result.success,
          duration_ms: result.execution_result.duration_ms,
          cost_usd: result.execution_result.cost_usd,
        },
        total_cost_usd: result.cost_usd,
        total_duration_ms: result.duration_ms,
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Brain cycle failed',
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Error triggering Brain cycle:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger Brain cycle',
      error: error.message,
    });
  }
});

/**
 * GET /api/brain/decisions
 * Get Brain decision history for the authenticated user
 */
router.get('/decisions', async (req, res) => {
  const client = await pool.connect();
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    const result = await client.query(
      `SELECT
        bd.*,
        m.name as module_name,
        m.type as module_type,
        me.status as execution_status,
        me.duration_ms as execution_duration_ms,
        me.cost_usd as execution_cost_usd
       FROM brain_decisions bd
       LEFT JOIN modules m ON bd.module_id = m.id
       LEFT JOIN module_executions me ON bd.execution_id = me.id
       WHERE bd.user_id = $1
       ORDER BY bd.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    // Get total count
    const countResult = await client.query(
      'SELECT COUNT(*) FROM brain_decisions WHERE user_id = $1',
      [req.user.id]
    );

    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      decisions: result.rows,
      pagination: {
        limit,
        offset,
        total: totalCount,
        has_more: offset + limit < totalCount,
      },
    });
  } catch (error) {
    console.error('Error getting Brain decisions:', error);
    res.status(500).json({ success: false, message: 'Failed to get Brain decisions' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/brain/decisions/:id
 * Get a specific Brain decision by ID
 */
router.get('/decisions/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    const result = await client.query(
      `SELECT
        bd.*,
        m.name as module_name,
        m.type as module_type,
        me.status as execution_status,
        me.duration_ms as execution_duration_ms,
        me.cost_usd as execution_cost_usd,
        me.started_at as execution_started_at,
        me.completed_at as execution_completed_at,
        me.error_message as execution_error
       FROM brain_decisions bd
       LEFT JOIN modules m ON bd.module_id = m.id
       LEFT JOIN module_executions me ON bd.execution_id = me.id
       WHERE bd.id = $1 AND bd.user_id = $2`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Brain decision not found',
      });
    }

    res.json({
      success: true,
      decision: result.rows[0],
    });
  } catch (error) {
    console.error(`Error getting Brain decision ${req.params.id}:`, error);
    res.status(500).json({ success: false, message: 'Failed to get Brain decision' });
  } finally {
    client.release();
  }
});

module.exports = router;
