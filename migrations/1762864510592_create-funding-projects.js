exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('funding_projects', {
    id: 'id',
    user_id: {
      type: 'integer',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE'
    },
    name: {
      type: 'varchar(255)',
      notNull: true
    },
    description: {
      type: 'text'
    },
    goal_amount_usd: {
      type: 'numeric(12, 2)'
    },
    status: {
      type: 'varchar(50)',
      notNull: true,
      default: 'active'
    },
    display_order: {
      type: 'integer',
      notNull: true,
      default: 0
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp')
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp')
    }
  });

  // Add index on user_id for faster lookups
  pgm.createIndex('funding_projects', 'user_id');
};

exports.down = (pgm) => {
  pgm.dropTable('funding_projects');
};
