exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('donations', {
    thanked_at: {
      type: 'timestamp',
      notNull: false
    }
  });

  pgm.createIndex('donations', 'thanked_at');
};

exports.down = (pgm) => {
  pgm.dropIndex('donations', 'thanked_at');
  pgm.dropColumn('donations', 'thanked_at');
};
