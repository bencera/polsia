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
  // Add company-related fields for public dashboard feature
  pgm.addColumns('users', {
    company_name: {
      type: 'varchar(255)',
      notNull: false,
    },
    company_slug: {
      type: 'varchar(255)',
      notNull: false,
      unique: true,
    },
    public_dashboard_enabled: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
  });

  // Create index on company_slug for fast public dashboard lookups
  pgm.createIndex('users', 'company_slug', {
    name: 'idx_users_company_slug',
    where: 'company_slug IS NOT NULL',
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  // Drop index first
  pgm.dropIndex('users', 'company_slug', {
    name: 'idx_users_company_slug',
    ifExists: true,
  });

  // Remove columns
  pgm.dropColumns('users', ['company_name', 'company_slug', 'public_dashboard_enabled']);
};
