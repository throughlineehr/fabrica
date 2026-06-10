# Fabrica CLI - Terminal to agent signal system for Claude Code
# Install with: brew tap throughlineehr/fabrica && brew install fabrica

class Fabrica < Formula
  desc "Terminal to agent signal system for Claude Code"
  homepage "https://github.com/throughlineehr/fabrica"
  version "0.2.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/throughlineehr/fabrica/releases/download/v#{version}/fabrica-darwin-arm64.tar.gz"
      sha256 "8a227b86ae16adb74e94df47d7994414a46f86f106fa652b1dc44bcadc8faffd"
    else
      url "https://github.com/throughlineehr/fabrica/releases/download/v#{version}/fabrica-darwin-amd64.tar.gz"
      sha256 "3f9bae761bf2ae4a51bd7e46396f03a94130b2e48f409167241384f4ff357dca"
    end
  end

  on_linux do
    if Hardware::CPU.intel?
      url "https://github.com/throughlineehr/fabrica/releases/download/v#{version}/fabrica-linux-amd64.tar.gz"
      sha256 "d464edd60f54d8a9e3ca22277e709d00a6ec57830e8caccacdc8c8dc3af13c46"
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
