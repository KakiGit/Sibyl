#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PLUGIN_DIR="$PROJECT_ROOT/packages/plugin"
OPENCODE_CONFIG="$HOME/.config/opencode"
OPENCODE_PLUGINS="$OPENCODE_CONFIG/plugins"
PLUGIN_NAME="sibyl-plugin.js"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

usage() {
    echo "Usage: $0 [install|update|uninstall]"
    echo ""
    echo "Commands:"
    echo "  install   - Install Sibyl plugin to global opencode"
    echo "  update    - Update existing Sibyl plugin installation"
    echo "  uninstall - Remove Sibyl plugin from global opencode"
    exit 1
}

uninstall_plugin() {
    echo -e "${YELLOW}Uninstalling Sibyl plugin...${NC}"
    
    if [ -f "$OPENCODE_PLUGINS/$PLUGIN_NAME" ]; then
        rm "$OPENCODE_PLUGINS/$PLUGIN_NAME"
        echo -e "${GREEN}✓ Plugin file removed${NC}"
    else
        echo -e "${YELLOW}Plugin file not found${NC}"
    fi
    
    if [ -f "$OPENCODE_PLUGINS/sibyl-plugin.d.ts" ]; then
        rm "$OPENCODE_PLUGINS/sibyl-plugin.d.ts"
    fi
    
    echo -e "${GREEN}✓ Sibyl plugin uninstalled${NC}"
}

COMMAND="${1:-install}"

case "$COMMAND" in
    uninstall)
        uninstall_plugin
        exit 0
        ;;
    install|update)
        ACTION="Installing"
        if [ "$COMMAND" = "update" ]; then
            ACTION="Updating"
        fi
        ;;
    *)
        usage
        ;;
esac

echo -e "${GREEN}${ACTION} Sibyl plugin to global opencode...${NC}"

if [ ! -d "$PLUGIN_DIR" ]; then
    echo -e "${RED}Error: Plugin directory not found at $PLUGIN_DIR${NC}"
    exit 1
fi

cd "$PROJECT_ROOT"

echo -e "${YELLOW}Building Sibyl packages...${NC}"
bun install --frozen-lockfile
bun run build

echo -e "${YELLOW}Bundling plugin...${NC}"
bun build "$PLUGIN_DIR/src/index.ts" \
    --outfile "$PLUGIN_DIR/dist/index.js" \
    --target=bun \
    --external "@opencode-ai/plugin" \
    --external "@opencode-ai/plugin/tool"

if [ ! -f "$PLUGIN_DIR/dist/index.js" ]; then
    echo -e "${RED}Error: Plugin build failed - dist/index.js not found${NC}"
    exit 1
fi

mkdir -p "$OPENCODE_PLUGINS"
mkdir -p "$OPENCODE_CONFIG"

echo -e "${YELLOW}Setting up dependencies...${NC}"
if [ ! -f "$OPENCODE_CONFIG/package.json" ]; then
    cat > "$OPENCODE_CONFIG/package.json" << 'PKGEOF'
{
  "dependencies": {
    "@opencode-ai/plugin": "^1.4.0"
  }
}
PKGEOF
fi

cd "$OPENCODE_CONFIG"
bun remove @sibyl/plugin 2>/dev/null || true
bun add @opencode-ai/plugin@^1.4.0 2>/dev/null || true
bun install

cd "$PROJECT_ROOT"

echo -e "${YELLOW}Copying plugin to $OPENCODE_PLUGINS/$PLUGIN_NAME...${NC}"
cp "$PLUGIN_DIR/dist/index.js" "$OPENCODE_PLUGINS/$PLUGIN_NAME"

echo ""
echo -e "${GREEN}✓ Sibyl plugin installed successfully!${NC}"
echo ""
echo "The plugin provides the following tools:"
echo "  - memory_recall: Search Wiki Pages and synthesize answers"
echo "  - memory_list: List all Wiki Pages"
echo "  - memory_query: Query Wiki Pages with questions"
echo ""
echo "Configuration via environment variables:"
echo "  SIBYL_SERVER_URL    - Sibyl server URL (default: http://localhost:3000)"
echo "  SIBYL_API_KEY       - API key for authentication"
echo "  SIBYL_AUTO_INJECT   - Auto-inject memory context (default: true)"
echo "  SIBYL_AUTO_SAVE     - Auto-save sessions to Sibyl (default: true)"
echo "  SIBYL_AUTO_SAVE_THRESHOLD - Min messages before auto-save (default: 1)"