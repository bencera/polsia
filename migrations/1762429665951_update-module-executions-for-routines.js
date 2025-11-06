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
  // Add routine_id to support executions triggered by routines
  pgm.addColumn('module_executions', {
    routine_id: {
      type: 'integer',
      references: 'routines',
      onDelete: 'CASCADE',
      comment: 'Reference to routine if this execution was triggered by a routine'
    }
  });

  // Add flag to distinguish routine executions from task executions
  pgm.addColumn('module_executions', {
    is_routine_execution: {
      type: 'boolean',
      default: false,
      comment: 'True if this execution was triggered by a routine, false if by a task'
    }
  });

  // Add index for efficient routine execution queries
  pgm.createIndex('module_executions', 'routine_id', { ifNotExists: true });

  // Add composite index for routine execution history
  pgm.createIndex('module_executions', ['routine_id', 'created_at'], { ifNotExists: true });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropColumn('module_executions', 'is_routine_execution');
  pgm.dropColumn('module_executions', 'routine_id');
};
