#!/bin/bash

# Find all TypeScript/TSX files
echo "=== SCANNING FOR UNUSED FILES ==="

# Get all component files
COMPONENTS=$(find /tmp/cc-agent/65213217/project/components -name "*.tsx" -o -name "*.ts" | grep -v ".next" | sort)

# Check each component if it's imported anywhere
for file in $COMPONENTS; do
  filename=$(basename "$file" | sed 's/\.[^.]*$//')

  # Search for imports of this file
  count=$(grep -r "from.*${filename}" /tmp/cc-agent/65213217/project --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | grep -v "$file" | wc -l)

  if [ "$count" -eq 0 ]; then
    echo "POTENTIALLY UNUSED: $file"
  fi
done
