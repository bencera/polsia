/**
 * Migration: Add has_autonomous_company field
 * Purpose: Separate user accounts from autonomous companies
 * - New users can create accounts without creating a company
 * - Existing users are marked as having autonomous companies
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
  // Add has_autonomous_company field to users table
  pgm.addColumn('users', {
    has_autonomous_company: {
      type: 'boolean',
      notNull: true,
      default: false,
      comment: 'Whether this user has created an autonomous company (public dashboard)'
    }
  });

  // Set existing users to have autonomous companies
  // (Grandfather existing users into the new system)
  pgm.sql(`
    UPDATE users
    SET has_autonomous_company = true
    WHERE id IN (
      SELECT DISTINCT user_id FROM user_balances
    )
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropColumn('users', 'has_autonomous_company');
};
