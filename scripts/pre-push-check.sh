#!/bin/bash
# pre-push-check.sh — Crowny-Org integrity check before git push
# Usage: bash scripts/pre-push-check.sh

set -e
cd "$(dirname "$0")/.."

echo "🔍 Crowny-Org Pre-Push Check"
echo "=============================="

ERRORS=0

# 1. Syntax check all JS files
echo ""
echo "📝 JS Syntax Check..."
for f in js/*.js; do
    if ! node -c "$f" 2>/dev/null; then
        echo "  ❌ $f"
        ERRORS=$((ERRORS+1))
    fi
done
if [ $ERRORS -eq 0 ]; then
    echo "  ✅ All JS files pass syntax check"
fi

# 2. Check CSS files exist and are non-empty
echo ""
echo "🎨 CSS Module Check..."
for f in css/*.css; do
    if [ ! -s "$f" ]; then
        echo "  ❌ Empty or missing: $f"
        ERRORS=$((ERRORS+1))
    fi
done
echo "  ✅ $(ls css/*.css | wc -l | tr -d ' ') CSS modules found"

# 3. Check index.html references
echo ""
echo "🔗 Script Reference Check..."
for f in $(grep -o 'src="js/[^"?]*' index.html | sed 's/src="//'); do
    if [ ! -f "$f" ]; then
        echo "  ❌ Missing: $f (referenced in index.html)"
        ERRORS=$((ERRORS+1))
    fi
done
for f in $(grep -o 'href="css/[^"?]*' index.html | sed 's/href="//'); do
    if [ ! -f "$f" ]; then
        echo "  ❌ Missing: $f (referenced in index.html)"
        ERRORS=$((ERRORS+1))
    fi
done
echo "  ✅ All referenced files exist"

# 4. Check for console.log in production (warning only)
echo ""
echo "⚠️  console.log Check (info only)..."
LOG_COUNT=$(grep -r 'console.log(' js/*.js | grep -v '//.*console' | wc -l | tr -d ' ')
echo "  ℹ️  $LOG_COUNT console.log statements found"

# 5. Check for remaining alert() calls
echo ""
echo "🔔 alert() Check..."
ALERT_COUNT=$(grep -r ' alert(' js/*.js | grep -v showToast | grep -v '//' | grep -v '\.alert\|alertBtn\|alertStatus\|alertLevel\|alertActive\|alertModal' | wc -l | tr -d ' ')
if [ "$ALERT_COUNT" -gt 0 ]; then
    echo "  ⚠️  $ALERT_COUNT alert() calls remaining"
else
    echo "  ✅ No raw alert() calls"
fi

# 6. Check SW cache version
echo ""
echo "📦 Service Worker..."
SW_VER=$(grep 'CACHE_VERSION' sw.js | head -1)
echo "  $SW_VER"

# 7. i18n key count comparison
echo ""
echo "🌐 i18n Key Check..."
KO_KEYS=$(python3 -c "import json; print(len(json.load(open('lang/ko.json'))))" 2>/dev/null || echo "?")
EN_KEYS=$(python3 -c "import json; print(len(json.load(open('lang/en.json'))))" 2>/dev/null || echo "?")
echo "  ko: $KO_KEYS keys, en: $EN_KEYS keys"
LANG_COUNT=$(ls lang/*.json 2>/dev/null | wc -l | tr -d ' ')
echo "  $LANG_COUNT language files total"

echo ""
echo "=============================="
if [ $ERRORS -gt 0 ]; then
    echo "❌ $ERRORS errors found — fix before pushing!"
    exit 1
else
    echo "✅ All checks passed!"
    exit 0
fi
