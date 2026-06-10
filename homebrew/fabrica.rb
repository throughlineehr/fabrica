# Fabrica CLI - Terminal to agent signal system for Claude Code
# Install with: brew tap throughlineehr/fabrica && brew install fabrica

class Fabrica < Formula
  desc "Terminal to agent signal system for Claude Code"
  homepage "https://github.com/throughlineehr/fabrica"
  version "0.1.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/throughlineehr/fabrica/releases/download/v#{version}/fabrica-darwin-arm64.tar.gz"
      sha256 "38fc30283612884db0b6b0a0dba249078e856866e0d4c0e2c068f354ebb977a4"
    else
      url "https://github.com/throughlineehr/fabrica/releases/download/v#{version}/fabrica-darwin-amd64.tar.gz"
      sha256 "d46857d195479cbea9eb3ab5882888d806ad1785852341e1b0a0fc19912102e7"
    end
  end

  on_linux do
    if Hardware::CPU.intel?
      url "https://github.com/throughlineehr/fabrica/releases/download/v#{version}/fabrica-linux-amd64.tar.gz"
      sha256 "85e1a510876989989f3095f825389aff3346ad9505b51883229dc612d98be9e7"
    end
  end

  def install
    bin.install "fabrica"
    bin.install "fabrica-mcp"
  end

  def caveats
    <<~EOS
      To set up Fabrica with Claude Code:

        fabrica start https://your-fabrica-server.com

      This will:
        1. Prompt you to log in or register
        2. Configure Claude Code's MCP integration
        3. Add the Fabrica status indicator

      Then restart Claude Code to activate the integration.
    EOS
  end

  test do
    assert_match "Fabrica CLI", shell_output("#{bin}/fabrica help")
  end
end
