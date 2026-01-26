#!/usr/bin/env bash
# Crabcode installer

set -e

REPO="https://github.com/promptfoo/crabcode"
INSTALL_DIR="${CRABCODE_INSTALL_DIR:-$HOME/.local/bin}"
SCRIPT_NAME="crabcode"
ALIAS_NAME="crab"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}Installing crabcode...${NC}"

# Detect OS and package manager
detect_os() {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "macos"
  elif [[ -f /etc/debian_version ]]; then
    echo "debian"
  elif [[ -f /etc/redhat-release ]]; then
    echo "redhat"
  elif [[ -f /etc/arch-release ]]; then
    echo "arch"
  else
    echo "unknown"
  fi
}

# Install a package using the appropriate package manager
install_package() {
  local package="$1"
  local os=$(detect_os)

  echo -e "${CYAN}Installing $package...${NC}"

  case "$os" in
    macos)
      if command -v brew &>/dev/null; then
        brew install "$package"
      else
        echo -e "${RED}Error: Homebrew not found. Install from https://brew.sh${NC}"
        echo "Then run: brew install $package"
        return 1
      fi
      ;;
    debian)
      if command -v apt-get &>/dev/null; then
        sudo apt-get update && sudo apt-get install -y "$package"
      else
        echo -e "${RED}Error: apt-get not found.${NC}"
        return 1
      fi
      ;;
    redhat)
      if command -v dnf &>/dev/null; then
        sudo dnf install -y "$package"
      elif command -v yum &>/dev/null; then
        sudo yum install -y "$package"
      else
        echo -e "${RED}Error: dnf/yum not found.${NC}"
        return 1
      fi
      ;;
    arch)
      if command -v pacman &>/dev/null; then
        sudo pacman -S --noconfirm "$package"
      else
        echo -e "${RED}Error: pacman not found.${NC}"
        return 1
      fi
      ;;
    *)
      echo -e "${RED}Unknown OS. Please install $package manually.${NC}"
      return 1
      ;;
  esac
}

# Check and install dependencies
echo "Checking dependencies..."

# Check git (required, should already be installed)
if ! command -v git &>/dev/null; then
  echo -e "${YELLOW}git not found. Installing...${NC}"
  install_package git || {
    echo -e "${RED}Error: Failed to install git. Please install manually.${NC}"
    exit 1
  }
fi

# Check tmux
if ! command -v tmux &>/dev/null; then
  echo -e "${YELLOW}tmux not found. Installing...${NC}"
  install_package tmux || {
    echo -e "${RED}Error: Failed to install tmux. Please install manually:${NC}"
    echo "  brew install tmux    # macOS"
    echo "  apt install tmux     # Ubuntu/Debian"
    exit 1
  }
fi

# Check yq
if ! command -v yq &>/dev/null; then
  echo -e "${YELLOW}yq not found. Installing...${NC}"
  install_package yq || {
    echo -e "${YELLOW}Warning: Failed to install yq. Some features may not work.${NC}"
    echo "Install manually:"
    echo "  brew install yq       # macOS"
    echo "  apt install yq        # Ubuntu/Debian"
    echo ""
    echo "Continuing installation anyway..."
  }
fi

# Check zip (optional, for toolkit share)
if ! command -v zip &>/dev/null; then
  echo -e "${YELLOW}zip not found. Installing...${NC}"
  install_package zip || {
    echo -e "${YELLOW}Warning: zip not installed. Toolkit share may not work.${NC}"
  }
fi

# Check jq (optional, for Slack integration)
if ! command -v jq &>/dev/null; then
  echo -e "${YELLOW}jq not found. Installing...${NC}"
  install_package jq || {
    echo -e "${YELLOW}Warning: jq not installed. Slack integration may not work.${NC}"
  }
fi

echo -e "${GREEN}All dependencies installed.${NC}"
echo ""

# Create install directory
mkdir -p "$INSTALL_DIR"

# Download the script
echo "Downloading crabcode..."
if command -v curl &>/dev/null; then
  curl -fsSL "$REPO/raw/main/src/crabcode" -o "$INSTALL_DIR/$SCRIPT_NAME"
elif command -v wget &>/dev/null; then
  wget -q "$REPO/raw/main/src/crabcode" -O "$INSTALL_DIR/$SCRIPT_NAME"
else
  echo -e "${RED}Error: curl or wget required for download.${NC}"
  exit 1
fi

chmod +x "$INSTALL_DIR/$SCRIPT_NAME"

# Create 'crab' symlink
echo "Creating 'crab' alias..."
ln -sf "$INSTALL_DIR/$SCRIPT_NAME" "$INSTALL_DIR/$ALIAS_NAME"

# Check if install directory is in PATH
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
  echo -e "${YELLOW}Note: $INSTALL_DIR is not in your PATH.${NC}"
  echo "Add this to your shell profile (.bashrc, .zshrc, etc.):"
  echo ""
  echo "  export PATH=\"\$PATH:$INSTALL_DIR\""
  echo ""
fi

echo -e "${GREEN}crabcode installed successfully!${NC}"
echo ""
echo "You can use either 'crabcode' or 'crab' command."
echo ""
echo "Next steps:"
echo "  1. Run 'crab init' to create your config"
echo "  2. Run 'crab ws 1' to start your first workspace"
echo ""
echo "Run 'crab cheat' for a quick reference."
