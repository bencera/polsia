/**
 * Add Profile Fields to Users Table
 *
 * Adds full_name and twitter_handle columns for user profile management
 */

exports.up = (pgm) => {
  // Add profile fields
  pgm.addColumn('users', {
    full_name: {
      type: 'varchar(255)',
      notNull: false,
      comment: 'User\'s full name for display'
    },
    twitter_handle: {
      type: 'varchar(100)',
      notNull: false,
      comment: 'User\'s Twitter/X handle'
    }
  });
};

exports.down = (pgm) => {
  // Remove profile fields
  pgm.dropColumn('users', ['full_name', 'twitter_handle']);
};
