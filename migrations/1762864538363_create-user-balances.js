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
  pgm.createTable('user_balances', {
    id: 'id',
    user_id: {
      type: 'integer',
      notNull: true,
      unique: true,
      references: 'users',
      onDelete: 'CASCADE'
    },
    total_donated_usd: {
      type: 'numeric(12, 2)',
      notNull: true,
      default: 0
    },
    total_spent_usd: {
      type: 'numeric(12, 2)',
      notNull: true,
      default: 0
    },
    current_balance_usd: {
      type: 'numeric(12, 2)',
      notNull: true,
      default: 0
    },
    last_updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp')
    }
  });

  // Create index on user_id for faster lookups
  pgm.createIndex('user_balances', 'user_id', { unique: true });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('user_balances');
};
