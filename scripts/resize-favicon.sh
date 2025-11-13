#!/bin/bash

# Script to resize favicon to different sizes using sips

SOURCE_IMAGE="$1"

if [ -z "$SOURCE_IMAGE" ]; then
  echo "Usage: ./resize-favicon.sh <path-to-source-image>"
  exit 1
fi

if [ ! -f "$SOURCE_IMAGE" ]; then
  echo "Error: Source image not found at $SOURCE_IMAGE"
  exit 1
fi

# Output directories
CLIENT_PUBLIC="client/public"
PUBLIC_APP="public/app"

echo "Resizing favicon from: $SOURCE_IMAGE"

# Create 16x16 favicon
echo "Creating 16x16 favicon..."
sips -z 16 16 "$SOURCE_IMAGE" --out "$CLIENT_PUBLIC/favicon-16x16.png"
sips -z 16 16 "$SOURCE_IMAGE" --out "$PUBLIC_APP/favicon-16x16.png"

# Create 192x192 favicon
echo "Creating 192x192 favicon..."
sips -z 192 192 "$SOURCE_IMAGE" --out "$CLIENT_PUBLIC/favicon-192x192.png"
sips -z 192 192 "$SOURCE_IMAGE" --out "$PUBLIC_APP/favicon-192x192.png"

# Create main favicon (32x32 is standard)
echo "Creating 32x32 main favicon..."
sips -z 32 32 "$SOURCE_IMAGE" --out "$CLIENT_PUBLIC/favicon.png"
sips -z 32 32 "$SOURCE_IMAGE" --out "$PUBLIC_APP/favicon.png"

echo "✓ Favicon files created successfully!"
echo "  - $CLIENT_PUBLIC/favicon.png (32x32)"
echo "  - $CLIENT_PUBLIC/favicon-16x16.png"
echo "  - $CLIENT_PUBLIC/favicon-192x192.png"
echo "  - $PUBLIC_APP/favicon.png (32x32)"
echo "  - $PUBLIC_APP/favicon-16x16.png"
echo "  - $PUBLIC_APP/favicon-192x192.png"
