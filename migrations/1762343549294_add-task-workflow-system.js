/**
 * Migration: Add Task Workflow System
 *
 * Transforms tasks from retrospective history to prospective workflow management.
 * Adds status workflow, reasoning fields, and agent-driven task lifecycle support.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
    // Add reasoning and summary text fields for each status transition
    pgm.addColumns('tasks', {
        suggestion_reasoning: {
            type: 'text',
            notNull: false,
            comment: 'Why this task was proposed/suggested'
        },
        approval_reasoning: {
            type: 'text',
            notNull: false,
            comment: 'Why CEO Brain approved this task'
        },
        completion_summary: {
            type: 'text',
            notNull: false,
            comment: 'What was accomplished when task completed'
        },
        rejection_reasoning: {
            type: 'text',
            notNull: false,
            comment: 'Why this task was rejected'
        },
        blocked_reason: {
            type: 'text',
            notNull: false,
            comment: 'Current blocker if status is waiting/blocked'
        }
    });

    // Add workflow tracking fields
    pgm.addColumns('tasks', {
        approved_by: {
            type: 'varchar(100)',
            notNull: false,
            comment: 'Who/what approved: ceo_brain, user, agent name'
        },
        approved_at: {
            type: 'timestamp',
            notNull: false,
            comment: 'When task was approved'
        },
        assigned_to_module_id: {
            type: 'integer',
            notNull: false,
            references: 'modules',
            onDelete: 'SET NULL',
            comment: 'Module assigned to handle this task'
        },
        brain_decision_id: {
            type: 'integer',
            notNull: false,
            references: 'brain_decisions',
            onDelete: 'SET NULL',
            comment: 'Link to brain decision if created by Brain'
        },
        proposed_by_module_id: {
            type: 'integer',
            notNull: false,
            references: 'modules',
            onDelete: 'SET NULL',
            comment: 'Module that proposed/suggested this task'
        },
        started_at: {
            type: 'timestamp',
            notNull: false,
            comment: 'When task moved to in_progress status'
        },
        blocked_at: {
            type: 'timestamp',
            notNull: false,
            comment: 'When task moved to waiting/blocked status'
        },
        last_status_change_at: {
            type: 'timestamp',
            notNull: false,
            comment: 'Timestamp of most recent status change'
        },
        last_status_change_by: {
            type: 'varchar(100)',
            notNull: false,
            comment: 'Agent/system that last changed the status'
        }
    });

    // Create indexes for efficient querying
    pgm.createIndex('tasks', 'status', {
        name: 'idx_tasks_status',
        ifNotExists: true
    });

    pgm.createIndex('tasks', 'approved_by', {
        name: 'idx_tasks_approved_by',
        ifNotExists: true
    });

    pgm.createIndex('tasks', 'assigned_to_module_id', {
        name: 'idx_tasks_assigned_to_module',
        ifNotExists: true
    });

    pgm.createIndex('tasks', 'brain_decision_id', {
        name: 'idx_tasks_brain_decision',
        ifNotExists: true
    });

    pgm.createIndex('tasks', 'proposed_by_module_id', {
        name: 'idx_tasks_proposed_by_module',
        ifNotExists: true
    });

    // Add comment to status column documenting valid values
    pgm.sql(`
        COMMENT ON COLUMN tasks.status IS 'Task lifecycle status: suggested, approved, in_progress, waiting, blocked, completed, rejected, failed';
    `);

    // Note: We keep the existing default status='completed' for backward compatibility
    // New task workflow will explicitly set status='suggested' when created
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
    // Drop indexes
    pgm.dropIndex('tasks', 'proposed_by_module_id', {
        name: 'idx_tasks_proposed_by_module',
        ifExists: true
    });
    pgm.dropIndex('tasks', 'brain_decision_id', {
        name: 'idx_tasks_brain_decision',
        ifExists: true
    });
    pgm.dropIndex('tasks', 'assigned_to_module_id', {
        name: 'idx_tasks_assigned_to_module',
        ifExists: true
    });
    pgm.dropIndex('tasks', 'approved_by', {
        name: 'idx_tasks_approved_by',
        ifExists: true
    });
    pgm.dropIndex('tasks', 'status', {
        name: 'idx_tasks_status',
        ifExists: true
    });

    // Drop workflow tracking columns
    pgm.dropColumns('tasks', [
        'approved_by',
        'approved_at',
        'assigned_to_module_id',
        'brain_decision_id',
        'proposed_by_module_id',
        'started_at',
        'blocked_at',
        'last_status_change_at',
        'last_status_change_by'
    ]);

    // Drop reasoning/summary columns
    pgm.dropColumns('tasks', [
        'suggestion_reasoning',
        'approval_reasoning',
        'completion_summary',
        'rejection_reasoning',
        'blocked_reason'
    ]);
};
