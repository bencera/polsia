exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('donations', {
    id: 'id',
    user_id: {
      type: 'integer',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE'
    },
    funding_project_id: {
      type: 'integer',
      references: 'funding_projects',
      onDelete: 'SET NULL'
    },
    donor_name: {
      type: 'varchar(255)'
    },
    donor_email: {
      type: 'varchar(255)'
    },
    amount_usd: {
      type: 'numeric(12, 2)',
      notNull: true
    },
    stripe_payment_intent_id: {
      type: 'varchar(255)',
      unique: true
    },
    status: {
      type: 'varchar(50)',
      notNull: true,
      default: 'pending'
    },
    message: {
      type: 'text'
    },
    is_anonymous: {
      type: 'boolean',
      notNull: true,
      default: false
    },
    metadata: {
      type: 'jsonb'
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp')
    },
    completed_at: {
      type: 'timestamp'
    }
  });

  // Indexes for faster lookups
  pgm.createIndex('donations', 'user_id');
  pgm.createIndex('donations', 'funding_project_id');
  pgm.createIndex('donations', 'stripe_payment_intent_id');
  pgm.createIndex('donations', 'status');
};

exports.down = (pgm) => {
  pgm.dropTable('donations');
};
