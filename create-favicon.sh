#!/bin/bash
# Script to create favicon from logo image
# Usage: ./create-favicon.sh path/to/logo.png

if [ -z "$1" ]; then
    echo "Usage: ./create-favicon.sh path/to/logo.png"
    exit 1
fi

LOGO_PATH="$1"
OUTPUT_PATH="./client/public/favicon.png"

# Create 32x32 favicon (standard size)
sips -z 32 32 "$LOGO_PATH" --out "$OUTPUT_PATH"

# Also create additional sizes for better browser support
sips -z 16 16 "$LOGO_PATH" --out "./client/public/favicon-16x16.png"
sips -z 192 192 "$LOGO_PATH" --out "./client/public/favicon-192x192.png"

echo "✅ Favicon created successfully!"
echo "   - favicon.png (32x32)"
echo "   - favicon-16x16.png (16x16)"
echo "   - favicon-192x192.png (192x192)"
