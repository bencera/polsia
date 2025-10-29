# Database Migrations

This project uses `node-pg-migrate` for database schema management.

## Quick Start

### Run all pending migrations
```bash
npm run migrate
```

### Create a new migration
```bash
npm run migrate:create add-column-name
```

### Rollback the last migration
```bash
npm run migrate:down
```

## Migration Files

Migrations are stored in the `/migrations` directory. Each migration has:
- `up()` function: applies the changes
- `down()` function: reverts the changes

## Example: Adding a column

```bash
npm run migrate:create add-user-phone
```

This creates a new migration file. Edit it:

```javascript
export const up = (pgm) => {
  pgm.addColumn('users', {
    phone: { type: 'varchar(20)', notNull: false }
  });
};

export const down = (pgm) => {
  pgm.dropColumn('users', 'phone');
};
```

Then run:
```bash
npm run migrate
```

## Deployment on Render

Render will automatically run migrations before starting your server if you add this to your build command:

**Build Command:**
```
npm run build && npm run migrate
```

**Start Command:**
```
npm start
```

This ensures migrations run on every deployment before the server starts.

## Documentation

Full documentation: https://salsita.github.io/node-pg-migrate/
