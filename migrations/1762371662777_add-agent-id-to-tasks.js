/**
 * Migration: Add Agent ID to Tasks Table
 *
 * Adds assigned_to_agent_id column to tasks table to enable task assignment to agents.
 * This allows Brain CEO to assign tasks to either modules (scheduled) or agents (task-driven).
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
    // Add assigned_to_agent_id column to tasks table
    pgm.addColumns('tasks', {
        assigned_to_agent_id: {
            type: 'integer',
            notNull: false,
            references: 'agents(id)',
            onDelete: 'SET NULL'
        }
    });

    // Create index for efficient queries
    pgm.createIndex('tasks', 'assigned_to_agent_id', {
        name: 'idx_tasks_assigned_to_agent'
    });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
    pgm.dropIndex('tasks', 'assigned_to_agent_id', {
        name: 'idx_tasks_assigned_to_agent'
    });
    pgm.dropColumns('tasks', ['assigned_to_agent_id']);
};
