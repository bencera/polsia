/**
 * Migration: Create Agents Table
 *
 * Creates agents table for task-driven AI agents that execute specific work assigned by Brain CEO.
 * Agents are distinct from modules - they're triggered by task assignments, not schedules.
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
    // Create agents table
    pgm.createTable('agents', {
        id: 'id', // Auto-incrementing primary key
        user_id: {
            type: 'integer',
            notNull: true,
            references: 'users(id)',
            onDelete: 'CASCADE'
        },
        name: {
            type: 'varchar(255)',
            notNull: true
        },
        description: {
            type: 'text',
            notNull: false
        },
        role: {
            type: 'text',
            notNull: true
        },
        agent_type: {
            type: 'varchar(50)',
            notNull: true
        },
        status: {
            type: 'varchar(50)',
            notNull: true,
            default: "'active'"
        },
        config: {
            type: 'jsonb',
            notNull: false
        },
        metadata: {
            type: 'jsonb',
            notNull: false
        },
        created_at: {
            type: 'timestamp',
            notNull: true,
            default: pgm.func('current_timestamp')
        },
        updated_at: {
            type: 'timestamp',
            notNull: true,
            default: pgm.func('current_timestamp')
        }
    });

    // Create indexes for efficient queries
    pgm.createIndex('agents', 'user_id', {
        name: 'idx_agents_user_id'
    });

    pgm.createIndex('agents', 'status', {
        name: 'idx_agents_status'
    });

    pgm.createIndex('agents', 'agent_type', {
        name: 'idx_agents_agent_type'
    });

    // Composite index for finding active agents by type
    pgm.createIndex('agents', ['user_id', 'status'], {
        name: 'idx_agents_user_status'
    });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
    pgm.dropTable('agents');
};
