exports.shorthands = undefined;

exports.up = (pgm) => {
    // Rename the main table
    pgm.renameTable('module_executions', 'agent_executions');

    // Rename the primary key sequence
    pgm.sql(`
        ALTER SEQUENCE module_executions_id_seq RENAME TO agent_executions_id_seq;
    `);

    // Update indexes - rename them for clarity
    pgm.sql(`
        ALTER INDEX module_executions_pkey RENAME TO agent_executions_pkey;
        ALTER INDEX module_executions_user_id_index RENAME TO agent_executions_user_id_index;
        ALTER INDEX module_executions_status_index RENAME TO agent_executions_status_index;
        ALTER INDEX module_executions_module_id_index RENAME TO agent_executions_module_id_index;
        ALTER INDEX module_executions_module_id_created_at_index RENAME TO agent_executions_module_id_created_at_index;
        ALTER INDEX module_executions_routine_id_index RENAME TO agent_executions_routine_id_index;
        ALTER INDEX module_executions_routine_id_created_at_index RENAME TO agent_executions_routine_id_created_at_index;
    `);

    // Rename foreign key constraints
    pgm.sql(`
        ALTER TABLE agent_executions
        RENAME CONSTRAINT module_executions_user_id_fkey TO agent_executions_user_id_fkey;
    `);

    // Add comment explaining the unified model
    pgm.sql(`
        COMMENT ON TABLE agent_executions IS
        'Execution history for all agents (formerly module_executions). Tracks runs from scheduled agents, task-driven agents, and on-demand executions.';
    `);

    // Note: We keep module_id and routine_id columns for backwards compatibility
    // They will be deprecated but kept for historical execution records
    pgm.sql(`
        COMMENT ON COLUMN agent_executions.module_id IS 'DEPRECATED: Legacy module reference. New executions should not use this.';
        COMMENT ON COLUMN agent_executions.routine_id IS 'DEPRECATED: Legacy routine reference. New executions should not use this.';
    `);

    // Add agent_id column for new execution model (nullable for backwards compatibility)
    pgm.addColumn('agent_executions', {
        agent_id: {
            type: 'integer',
            notNull: false,
            references: 'agents',
            onDelete: 'SET NULL'
        }
    });

    pgm.createIndex('agent_executions', 'agent_id');

    pgm.sql(`
        COMMENT ON COLUMN agent_executions.agent_id IS 'Reference to the agent that ran this execution (new unified model).';
    `);
};

exports.down = (pgm) => {
    // Remove agent_id column
    pgm.dropIndex('agent_executions', 'agent_id');
    pgm.dropColumn('agent_executions', 'agent_id');

    // Remove comments
    pgm.sql(`
        COMMENT ON TABLE agent_executions IS NULL;
        COMMENT ON COLUMN agent_executions.module_id IS NULL;
        COMMENT ON COLUMN agent_executions.routine_id IS NULL;
    `);

    // Rename foreign key constraints back
    pgm.sql(`
        ALTER TABLE agent_executions
        RENAME CONSTRAINT agent_executions_user_id_fkey TO module_executions_user_id_fkey;
    `);

    // Rename indexes back
    pgm.sql(`
        ALTER INDEX agent_executions_pkey RENAME TO module_executions_pkey;
        ALTER INDEX agent_executions_user_id_index RENAME TO module_executions_user_id_index;
        ALTER INDEX agent_executions_status_index RENAME TO module_executions_status_index;
        ALTER INDEX agent_executions_module_id_index RENAME TO module_executions_module_id_index;
        ALTER INDEX agent_executions_module_id_created_at_index RENAME TO module_executions_module_id_created_at_index;
        ALTER INDEX agent_executions_routine_id_index RENAME TO module_executions_routine_id_index;
        ALTER INDEX agent_executions_routine_id_created_at_index RENAME TO module_executions_routine_id_created_at_index;
    `);

    // Rename sequence back
    pgm.sql(`
        ALTER SEQUENCE agent_executions_id_seq RENAME TO module_executions_id_seq;
    `);

    // Rename table back
    pgm.renameTable('agent_executions', 'module_executions');
};
