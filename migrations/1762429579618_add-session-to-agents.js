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
  // Add session_id for persistent session continuity across all agent executions
  pgm.addColumn('agents', {
    session_id: {
      type: 'varchar(255)',
      comment: 'Claude SDK session ID for continuous learning across routine and task executions'
    }
  });

  // Add workspace_path to track persistent workspace location
  pgm.addColumn('agents', {
    workspace_path: {
      type: 'varchar(500)',
      comment: 'Persistent workspace directory path for this agent'
    }
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropColumn('agents', 'session_id');
  pgm.dropColumn('agents', 'workspace_path');
};
