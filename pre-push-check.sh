#!/bin/bash

# Simple pre-push check script
# Add any integrity checks here

echo "Running basic checks..."

# Check if main files exist
if [ ! -f "index.html" ]; then
    echo "❌ index.html is missing"
    exit 1
fi

if [ ! -f "js/social.js" ]; then
    echo "❌ js/social.js is missing"
    exit 1
fi

echo "✅ Basic checks passed"
exit 0