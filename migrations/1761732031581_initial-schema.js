/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  // Create waitlist table
  pgm.createTable('waitlist', {
    id: 'id',
    email: { type: 'varchar(255)', notNull: true, unique: true },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  }, { ifNotExists: true });
  pgm.createIndex('waitlist', 'email', { ifNotExists: true });

  // Create users table
  pgm.createTable('users', {
    id: 'id',
    email: { type: 'varchar(255)', notNull: true, unique: true },
    password_hash: { type: 'varchar(255)', notNull: true },
    name: { type: 'varchar(255)', notNull: false },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  }, { ifNotExists: true });
  pgm.createIndex('users', 'email', { ifNotExists: true });

  // Create tasks table
  pgm.createTable('tasks', {
    id: 'id',
    user_id: {
      type: 'integer',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    title: { type: 'varchar(255)', notNull: true },
    description: { type: 'text', notNull: false },
    status: { type: 'varchar(50)', notNull: true, default: 'completed' },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    completed_at: { type: 'timestamp', notNull: false },
  }, { ifNotExists: true });
  pgm.createIndex('tasks', 'user_id', { ifNotExists: true });

  // Create service_connections table
  pgm.createTable('service_connections', {
    id: 'id',
    user_id: {
      type: 'integer',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    service_name: { type: 'varchar(50)', notNull: true },
    status: { type: 'varchar(50)', notNull: true, default: 'connected' },
    metadata: { type: 'jsonb', notNull: false },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  }, { ifNotExists: true });
  pgm.createIndex('service_connections', 'user_id', { ifNotExists: true });

  // Create task_services junction table (many-to-many)
  pgm.createTable('task_services', {
    id: 'id',
    task_id: {
      type: 'integer',
      notNull: true,
      references: 'tasks',
      onDelete: 'CASCADE',
    },
    service_connection_id: {
      type: 'integer',
      notNull: true,
      references: 'service_connections',
      onDelete: 'CASCADE',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  }, { ifNotExists: true });
  pgm.createConstraint('task_services', 'task_services_unique', {
    unique: ['task_id', 'service_connection_id'],
  }, { ifNotExists: true });
  pgm.createIndex('task_services', 'task_id', { ifNotExists: true });
  pgm.createIndex('task_services', 'service_connection_id', { ifNotExists: true });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  // Drop tables in reverse order (respecting foreign key constraints)
  pgm.dropTable('task_services');
  pgm.dropTable('service_connections');
  pgm.dropTable('tasks');
  pgm.dropTable('users');
  pgm.dropTable('waitlist');
};
