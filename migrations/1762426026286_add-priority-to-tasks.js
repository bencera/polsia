/**
 * Migration: Add Priority to Tasks
 *
 * Adds priority column to tasks table to support task prioritization.
 * Valid priorities: critical, high, medium, low
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
    // Add priority column to tasks table
    pgm.addColumns('tasks', {
        priority: {
            type: 'varchar(20)',
            notNull: false,
            default: 'medium',
            comment: 'Task priority: critical, high, medium, low'
        }
    });

    // Create index for efficient priority-based queries
    pgm.createIndex('tasks', 'priority', {
        name: 'idx_tasks_priority',
        ifNotExists: true
    });

    // Add comment documenting valid priority values
    pgm.sql(`
        COMMENT ON COLUMN tasks.priority IS 'Task priority level: critical, high, medium, low';
    `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
    // Drop index
    pgm.dropIndex('tasks', 'priority', {
        name: 'idx_tasks_priority',
        ifExists: true
    });

    // Drop priority column
    pgm.dropColumns('tasks', ['priority']);
};
