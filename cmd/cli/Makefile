# Fabrica Daemon Makefile

BINARY_NAME=fabrica
MCP_BINARY=fabrica-mcp
VERSION?=0.1.0

.PHONY: all build clean install mcp

all: build mcp

build:
	go build -ldflags "-X main.version=$(VERSION)" -o $(BINARY_NAME) .

mcp:
	cd ../mcp-server && go build -o $(MCP_BINARY) .

clean:
	rm -f $(BINARY_NAME)
	rm -f ../mcp-server/$(MCP_BINARY)

install: build mcp
	mkdir -p $(HOME)/.local/bin
	cp $(BINARY_NAME) $(HOME)/.local/bin/
	cp ../mcp-server/$(MCP_BINARY) $(HOME)/.local/bin/
	@echo "Installed to ~/.local/bin/"
	@echo "Make sure ~/.local/bin is in your PATH"

# Build for release (all platforms)
release: clean-dist
	@mkdir -p dist
	@echo "Building darwin-arm64..."
	@GOOS=darwin GOARCH=arm64 go build -ldflags "-X main.version=$(VERSION)" -o dist/fabrica .
	@cd ../mcp-server && GOOS=darwin GOARCH=arm64 go build -o ../daemon/dist/fabrica-mcp .
	@cd dist && tar -czf fabrica-darwin-arm64.tar.gz fabrica fabrica-mcp && rm fabrica fabrica-mcp
	@echo "Building darwin-amd64..."
	@GOOS=darwin GOARCH=amd64 go build -ldflags "-X main.version=$(VERSION)" -o dist/fabrica .
	@cd ../mcp-server && GOOS=darwin GOARCH=amd64 go build -o ../daemon/dist/fabrica-mcp .
	@cd dist && tar -czf fabrica-darwin-amd64.tar.gz fabrica fabrica-mcp && rm fabrica fabrica-mcp
	@echo "Building linux-amd64..."
	@GOOS=linux GOARCH=amd64 go build -ldflags "-X main.version=$(VERSION)" -o dist/fabrica .
	@cd ../mcp-server && GOOS=linux GOARCH=amd64 go build -o ../daemon/dist/fabrica-mcp .
	@cd dist && tar -czf fabrica-linux-amd64.tar.gz fabrica fabrica-mcp && rm fabrica fabrica-mcp
	@echo ""
	@echo "Release tarballs:"
	@ls -la dist/*.tar.gz
	@echo ""
	@echo "SHA256 hashes (for homebrew formula):"
	@cd dist && shasum -a 256 *.tar.gz

clean-dist:
	@rm -rf dist

# Generate homebrew formula with correct hashes
formula: release
	@echo "Generating homebrew formula..."
	@ARM64_SHA=$$(cd dist && shasum -a 256 fabrica-darwin-arm64.tar.gz | cut -d' ' -f1) && \
	AMD64_SHA=$$(cd dist && shasum -a 256 fabrica-darwin-amd64.tar.gz | cut -d' ' -f1) && \
	LINUX_SHA=$$(cd dist && shasum -a 256 fabrica-linux-amd64.tar.gz | cut -d' ' -f1) && \
	sed -e "s/REPLACE_WITH_ARM64_SHA256/$$ARM64_SHA/" \
	    -e "s/REPLACE_WITH_AMD64_SHA256/$$AMD64_SHA/" \
	    -e "s/REPLACE_WITH_LINUX_SHA256/$$LINUX_SHA/" \
	    -e "s/version \".*\"/version \"$(VERSION)\"/" \
	    -e "s|/v[0-9.]*\/|/v$(VERSION)/|g" \
	    ../../homebrew/fabrica.rb > dist/fabrica.rb
	@echo "Formula written to dist/fabrica.rb"
	@cat dist/fabrica.rb
