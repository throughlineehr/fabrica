class Fabrica < Formula
  desc "Terminal to agent signal system for Claude Code"
  homepage "https://github.com/thirdcreed/fabrica"
  version "0.1.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/thirdcreed/fabrica/releases/download/v0.1.0/fabrica-darwin-arm64.tar.gz"
      sha256 "REPLACE_WITH_ARM64_SHA256"
    else
      url "https://github.com/thirdcreed/fabrica/releases/download/v0.1.0/fabrica-darwin-amd64.tar.gz"
      sha256 "REPLACE_WITH_AMD64_SHA256"
    end
  end

  on_linux do
    url "https://github.com/thirdcreed/fabrica/releases/download/v0.1.0/fabrica-linux-amd64.tar.gz"
    sha256 "REPLACE_WITH_LINUX_SHA256"
  end

  def install
    bin.install "fabrica"
    bin.install "fabrica-mcp"
  end

  def post_install
    ohai "Run 'fabrica install' to configure Claude Code"
  end

  test do
    system "#{bin}/fabrica", "help"
  end
end
