#!/bin/bash

# Setup script for Polsia database
echo "🔧 Setting up Polsia database..."

# Start PostgreSQL if not running
brew services start postgresql@16 2>/dev/null

# Wait a moment for PostgreSQL to be ready
sleep 2

# Path to PostgreSQL binaries
PSQL_PATH="/opt/homebrew/opt/postgresql@16/bin"

# Check if database exists, create if not
if ! $PSQL_PATH/psql -lqt | cut -d \| -f 1 | grep -qw polsia; then
    echo "📦 Creating database 'polsia'..."
    $PSQL_PATH/createdb polsia
    echo "✅ Database created!"
else
    echo "✅ Database 'polsia' already exists"
fi

echo ""
echo "🚀 Now run: npm run dev"
echo ""
echo "📝 After the server starts and creates tables, run:"
echo "   $PSQL_PATH/psql -d polsia -f seed.sql"
echo ""
echo "🔑 Login credentials:"
echo "   Email: test@polsia.ai"
echo "   Password: password123"
