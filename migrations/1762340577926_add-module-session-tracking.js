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
  // Add session_id column to modules table for session resumption
  pgm.addColumn('modules', {
    session_id: {
      type: 'varchar(255)',
      notNull: false,
      comment: 'Claude SDK session ID for continuous learning across executions'
    }
  });

  console.log('✅ Added session_id column to modules table');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  // Remove session_id column from modules table
  pgm.dropColumn('modules', 'session_id');

  console.log('✅ Removed session_id column from modules table');
};
