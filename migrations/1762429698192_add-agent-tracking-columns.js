/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  // Add tracking columns to agents table for statistics and monitoring
  pgm.addColumn('agents', {
    total_routine_runs: {
      type: 'integer',
      default: 0,
      notNull: true,
      comment: 'Total number of routine executions completed by this agent'
    }
  });

  pgm.addColumn('agents', {
    total_task_completions: {
      type: 'integer',
      default: 0,
      notNull: true,
      comment: 'Total number of tasks completed by this agent'
    }
  });

  pgm.addColumn('agents', {
    last_active_at: {
      type: 'timestamp',
      comment: 'Last time this agent executed (routine or task)'
    }
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropColumn('agents', 'total_routine_runs');
  pgm.dropColumn('agents', 'total_task_completions');
  pgm.dropColumn('agents', 'last_active_at');
};
