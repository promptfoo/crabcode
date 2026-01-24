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

# Check dependencies
echo "Checking dependencies..."

if ! command -v git &>/dev/null; then
  echo -e "${RED}Error: git is required but not installed.${NC}"
  exit 1
fi

if ! command -v tmux &>/dev/null; then
  echo -e "${RED}Error: tmux is required but not installed.${NC}"
  echo "Install with:"
  echo "  brew install tmux    # macOS"
  echo "  apt install tmux     # Ubuntu/Debian"
  exit 1
fi

if ! command -v yq &>/dev/null; then
  echo -e "${YELLOW}Warning: yq is required but not installed.${NC}"
  echo "Install with:"
  echo "  brew install yq       # macOS"
  echo "  apt install yq        # Ubuntu/Debian"
  echo ""
  echo "Continuing installation anyway..."
fi

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
