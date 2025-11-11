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
  pgm.addColumns('modules', {
    funding_project_id: {
      type: 'integer',
      references: 'funding_projects',
      onDelete: 'SET NULL'
    }
  });

  // Add index for faster lookups
  pgm.createIndex('modules', 'funding_project_id');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropColumns('modules', ['funding_project_id']);
};
