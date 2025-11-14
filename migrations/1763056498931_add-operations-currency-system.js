/**
 * Add Operations Currency System
 *
 * Adds company_operations and user_operations columns to user_balances table.
 * Operations are the user-facing virtual currency (1 op = $0.01 internally).
 * Migrates existing current_balance_usd to company_operations.
 */

exports.up = (pgm) => {
  // Add operations columns
  pgm.addColumn('user_balances', {
    company_operations: {
      type: 'integer',
      notNull: true,
      default: 0,
      comment: 'Company operations balance for autonomous AI modules'
    },
    user_operations: {
      type: 'integer',
      notNull: true,
      default: 0,
      comment: 'User operations balance for manual actions'
    }
  });

  // Migrate existing balance to company_operations
  // Assuming $1 = 100 operations
  pgm.sql(`
    UPDATE user_balances
    SET company_operations = ROUND(current_balance_usd * 100)
    WHERE current_balance_usd > 0
  `);

  // Add index for performance
  pgm.createIndex('user_balances', 'user_id');
};

exports.down = (pgm) => {
  // Remove index
  pgm.dropIndex('user_balances', 'user_id');

  // Remove operations columns
  pgm.dropColumn('user_balances', ['company_operations', 'user_operations']);
};
