#!/bin/bash
# Set up the Homebrew tap repository for Fabrica
# Run this once to create the tap repo on GitHub

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TAP_DIR="/tmp/homebrew-fabrica"
ORG="throughlineehr"

echo "=== Setting up Homebrew tap ==="
echo ""

# Check if gh is installed and authenticated
if ! command -v gh &> /dev/null; then
    echo "Error: GitHub CLI (gh) is not installed."
    echo "Install with: brew install gh"
    exit 1
fi

if ! gh auth status &> /dev/null; then
    echo "Error: Not authenticated with GitHub CLI."
    echo "Run: gh auth login"
    exit 1
fi

# Check if tap repo already exists
if gh repo view "$ORG/homebrew-fabrica" &> /dev/null; then
    echo "Tap repo $ORG/homebrew-fabrica already exists."
    echo ""
    echo "To update the formula:"
    echo "  git clone https://github.com/$ORG/homebrew-fabrica.git"
    echo "  cp $REPO_ROOT/homebrew/fabrica.rb homebrew-fabrica/Formula/"
    echo "  cd homebrew-fabrica && git add . && git commit -m 'Update fabrica formula' && git push"
    exit 0
fi

echo "Creating tap repository..."

# Create temporary directory
rm -rf "$TAP_DIR"
mkdir -p "$TAP_DIR/Formula"

# Copy formula
cp "$REPO_ROOT/homebrew/fabrica.rb" "$TAP_DIR/Formula/"

# Create README
cat > "$TAP_DIR/README.md" << 'EOF'
# Homebrew Tap for Fabrica

This tap contains the Homebrew formula for [Fabrica](https://github.com/throughlineehr/fabrica).

## Installation

```bash
brew tap throughlineehr/fabrica
brew install fabrica
```

## Usage

```bash
# Connect to a Fabrica server
fabrica start https://your-server.com

# Or with an invite link
fabrica start https://your-server.com/invite/abc123
```

## What is Fabrica?

Fabrica is a terminal-to-agent signal system that integrates with Claude Code.
It lets you receive and send signals through a VSM (Viable System Model) based
organizational structure.
EOF

# Initialize git repo
cd "$TAP_DIR"
git init
git add .
git commit -m "Initial tap setup with fabrica formula"

# Create GitHub repo and push
gh repo create "$ORG/homebrew-fabrica" --public --source=. --push

echo ""
echo "=== Tap created successfully! ==="
echo ""
echo "Users can now install with:"
echo "  brew tap $ORG/fabrica"
echo "  brew install fabrica"

# Cleanup
rm -rf "$TAP_DIR"
