#!/bin/bash
# Release script for Fabrica CLI
# Creates a GitHub release and uploads binaries

set -e

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
    echo "Usage: ./release.sh <version>"
    echo "Example: ./release.sh 0.1.0"
    exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$REPO_ROOT/dist"
FORMULA="$REPO_ROOT/homebrew/fabrica.rb"

echo "=== Fabrica Release v$VERSION ==="
echo ""

# Check if gh is installed
if ! command -v gh &> /dev/null; then
    echo "Error: GitHub CLI (gh) is not installed."
    echo "Install with: brew install gh"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "Error: Not authenticated with GitHub CLI."
    echo "Run: gh auth login"
    exit 1
fi

# Build
echo "1. Building binaries..."
"$REPO_ROOT/scripts/build.sh" "$VERSION"
echo ""

# Read checksums
ARM64_SHA=$(grep "darwin-arm64" "$DIST_DIR/checksums.txt" | cut -d' ' -f1)
AMD64_SHA=$(grep "darwin-amd64" "$DIST_DIR/checksums.txt" | cut -d' ' -f1)
LINUX_SHA=$(grep "linux-amd64" "$DIST_DIR/checksums.txt" | cut -d' ' -f1)

echo "2. SHA256 checksums:"
echo "   darwin-arm64: $ARM64_SHA"
echo "   darwin-amd64: $AMD64_SHA"
echo "   linux-amd64:  $LINUX_SHA"
echo ""

# Update formula with real SHA256s
echo "3. Updating Homebrew formula..."
sed -i '' "s/PLACEHOLDER_ARM64_SHA256/$ARM64_SHA/" "$FORMULA"
sed -i '' "s/PLACEHOLDER_AMD64_SHA256/$AMD64_SHA/" "$FORMULA"
sed -i '' "s/PLACEHOLDER_LINUX_SHA256/$LINUX_SHA/" "$FORMULA"
echo "   Updated: $FORMULA"
echo ""

# Create release notes
RELEASE_NOTES=$(cat <<EOF
## Fabrica v$VERSION

### Installation

\`\`\`bash
brew tap throughlineehr/fabrica
brew install fabrica
\`\`\`

### Quick Start

\`\`\`bash
# Connect to a Fabrica server
fabrica start https://your-server.com

# Or via invite link
fabrica start https://your-server.com/invite/abc123
\`\`\`

### Checksums

| Platform | SHA256 |
|----------|--------|
| darwin-arm64 | \`$ARM64_SHA\` |
| darwin-amd64 | \`$AMD64_SHA\` |
| linux-amd64 | \`$LINUX_SHA\` |
EOF
)

echo "4. Creating GitHub release..."
gh release create "v$VERSION" \
    --title "Fabrica v$VERSION" \
    --notes "$RELEASE_NOTES" \
    "$DIST_DIR/fabrica-darwin-arm64.tar.gz" \
    "$DIST_DIR/fabrica-darwin-amd64.tar.gz" \
    "$DIST_DIR/fabrica-linux-amd64.tar.gz"

echo ""
echo "=== Release v$VERSION complete! ==="
echo ""
echo "Next steps:"
echo "  1. Create homebrew-fabrica tap repo if it doesn't exist:"
echo "     gh repo create throughlineehr/homebrew-fabrica --public"
echo ""
echo "  2. Copy the formula to the tap:"
echo "     cp $FORMULA /path/to/homebrew-fabrica/Formula/fabrica.rb"
echo ""
echo "  3. Users can then install with:"
echo "     brew tap throughlineehr/fabrica"
echo "     brew install fabrica"
