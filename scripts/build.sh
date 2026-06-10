#!/bin/bash
# Build script for Fabrica CLI binaries
# Produces tarballs for darwin-arm64, darwin-amd64, linux-amd64

set -e

VERSION="${1:-0.1.0}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$REPO_ROOT/dist"
CLI_DIR="$REPO_ROOT/cmd/cli"
MCP_DIR="$REPO_ROOT/cmd/mcp"

echo "Building Fabrica v$VERSION"
echo "Output: $BUILD_DIR"

# Clean and create build directory
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Platforms to build
PLATFORMS=(
    "darwin/arm64"
    "darwin/amd64"
    "linux/amd64"
)

for PLATFORM in "${PLATFORMS[@]}"; do
    GOOS="${PLATFORM%/*}"
    GOARCH="${PLATFORM#*/}"

    OUTPUT_NAME="fabrica-${GOOS}-${GOARCH}"
    OUTPUT_DIR="$BUILD_DIR/$OUTPUT_NAME"

    echo ""
    echo "Building for $GOOS/$GOARCH..."

    mkdir -p "$OUTPUT_DIR"

    # Build CLI (cd into directory since go.mod is there)
    echo "  - fabrica"
    (cd "$CLI_DIR" && GOOS=$GOOS GOARCH=$GOARCH go build -o "$OUTPUT_DIR/fabrica" .)

    # Build MCP server
    echo "  - fabrica-mcp"
    (cd "$MCP_DIR" && GOOS=$GOOS GOARCH=$GOARCH go build -o "$OUTPUT_DIR/fabrica-mcp" .)

    # Create tarball
    echo "  - Creating tarball"
    cd "$BUILD_DIR"
    tar -czf "${OUTPUT_NAME}.tar.gz" "$OUTPUT_NAME"
    rm -rf "$OUTPUT_NAME"

    # Calculate SHA256
    SHA256=$(shasum -a 256 "${OUTPUT_NAME}.tar.gz" | cut -d' ' -f1)
    echo "  - SHA256: $SHA256"
    echo "$SHA256  ${OUTPUT_NAME}.tar.gz" >> checksums.txt
done

echo ""
echo "Build complete!"
echo ""
echo "Artifacts in $BUILD_DIR:"
ls -la "$BUILD_DIR"
echo ""
echo "Checksums:"
cat "$BUILD_DIR/checksums.txt"
