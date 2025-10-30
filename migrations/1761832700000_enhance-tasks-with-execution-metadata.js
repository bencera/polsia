/**
 * Migration: Enhance tasks table with execution metadata
 * Adds fields to link tasks to executions and store execution metrics
 */

exports.up = (pgm) => {
    // Add execution context fields
    pgm.addColumns('tasks', {
        execution_id: {
            type: 'integer',
            references: 'module_executions',
            onDelete: 'SET NULL',
        },
        module_id: {
            type: 'integer',
            references: 'modules',
            onDelete: 'SET NULL',
        },
        cost_usd: {
            type: 'numeric(10, 6)',
            notNull: false,
        },
        duration_ms: {
            type: 'integer',
            notNull: false,
        },
        num_turns: {
            type: 'integer',
            notNull: false,
        },
    });

    // Create indexes for better query performance
    pgm.createIndex('tasks', 'execution_id');
    pgm.createIndex('tasks', 'module_id');
};

exports.down = (pgm) => {
    // Drop indexes first
    pgm.dropIndex('tasks', 'module_id');
    pgm.dropIndex('tasks', 'execution_id');

    // Drop columns
    pgm.dropColumns('tasks', [
        'execution_id',
        'module_id',
        'cost_usd',
        'duration_ms',
        'num_turns',
    ]);
};
