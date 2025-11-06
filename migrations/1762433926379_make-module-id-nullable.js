/**
 * Make module_id nullable in module_executions table
 * This is needed because routine executions don't have a module_id
 */

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
  // Make module_id nullable (remove NOT NULL constraint)
  pgm.alterColumn('module_executions', 'module_id', {
    notNull: false
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  // Restore NOT NULL constraint
  // Note: This will fail if there are any NULL values
  pgm.alterColumn('module_executions', 'module_id', {
    notNull: true
  });
};
