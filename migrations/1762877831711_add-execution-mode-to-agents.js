exports.shorthands = undefined;

exports.up = (pgm) => {
    // Add execution_mode enum type
    pgm.createType('execution_mode_type', ['scheduled', 'on_demand', 'task_driven']);

    // Add execution_mode field (default to 'on_demand' for existing agents)
    pgm.addColumn('agents', {
        execution_mode: {
            type: 'execution_mode_type',
            notNull: true,
            default: 'on_demand'
        }
    });

    // Add scheduling fields (only used when execution_mode = 'scheduled')
    pgm.addColumn('agents', {
        schedule_frequency: {
            type: 'varchar(50)',
            notNull: false // nullable - only for scheduled agents
        },
        last_run_at: {
            type: 'timestamp',
            notNull: false
        },
        next_run_at: {
            type: 'timestamp',
            notNull: false
        }
    });

    // Add indexes for common queries
    pgm.createIndex('agents', 'execution_mode');
    pgm.createIndex('agents', 'next_run_at', { where: 'execution_mode = \'scheduled\'' });

    // Add comment explaining the new architecture
    pgm.sql(`
        COMMENT ON COLUMN agents.execution_mode IS
        'Determines how this agent executes: scheduled (runs on cron), on_demand (manual trigger), task_driven (executes when assigned tasks by CEO Brain)';
    `);
};

exports.down = (pgm) => {
    // Remove indexes
    pgm.dropIndex('agents', 'execution_mode');
    pgm.dropIndex('agents', 'next_run_at');

    // Remove columns
    pgm.dropColumn('agents', 'schedule_frequency');
    pgm.dropColumn('agents', 'last_run_at');
    pgm.dropColumn('agents', 'next_run_at');
    pgm.dropColumn('agents', 'execution_mode');

    // Drop enum type
    pgm.dropType('execution_mode_type');
};
