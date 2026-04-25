#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PLUGIN_CORE_DIR="$PROJECT_ROOT/packages/plugin-core"
PLUGIN_OPENCODE_DIR="$PROJECT_ROOT/packages/plugin-opencode"
PLUGIN_CURSOR_DIR="$PROJECT_ROOT/packages/plugin-cursor"

OPENCODE_CONFIG="$HOME/.config/opencode"
OPENCODE_PLUGINS="$OPENCODE_CONFIG/plugins"
OPENCODE_PLUGIN_NAME="sibyl-plugin.js"

CURSOR_CONFIG="$HOME/.cursor"
CURSOR_HOOKS="$CURSOR_CONFIG/hooks"
CURSOR_HOOK_NAME="sibyl-hook.js"
CURSOR_HOOKS_CONFIG="$CURSOR_CONFIG/hooks.json"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[1;34m'
NC='\033[0m'

usage() {
    echo "Usage: $0 <command> [harness]"
    echo ""
    echo "Commands:"
    echo "  install   - Install Sibyl plugin for specified harness"
    echo "  update    - Update existing Sibyl plugin installation"
    echo "  uninstall - Remove Sibyl plugin from specified harness"
    echo ""
    echo "Harnesses:"
    echo "  opencode  - Install for OpenCode (default)"
    echo "  cursor    - Install for Cursor IDE hooks"
    echo ""
    echo "Examples:"
    echo "  $0 install               # Install for OpenCode (default)"
    echo "  $0 install opencode      # Install for OpenCode"
    echo "  $0 install cursor        # Install for Cursor"
    echo "  $0 update cursor         # Update Cursor plugin"
    echo "  $0 uninstall opencode    # Uninstall from OpenCode"
    exit 1
}

build_packages() {
    echo -e "${YELLOW}Building Sibyl packages...${NC}"
    cd "$PROJECT_ROOT"
    bun install --frozen-lockfile
    bun run build
}

bundle_opencode_plugin() {
    echo -e "${YELLOW}Bundling OpenCode plugin...${NC}"
    cd "$PROJECT_ROOT"
    bun build "$PLUGIN_OPENCODE_DIR/src/index.ts" \
        --outfile "$PLUGIN_OPENCODE_DIR/dist/index.js" \
        --target=bun \
        --external "@opencode-ai/plugin" \
        --external "@opencode-ai/plugin/tool"

    if [ ! -f "$PLUGIN_OPENCODE_DIR/dist/index.js" ]; then
        echo -e "${RED}Error: OpenCode plugin build failed${NC}"
        exit 1
    fi
}

bundle_cursor_hook() {
    echo -e "${YELLOW}Bundling Cursor hook...${NC}"
    cd "$PROJECT_ROOT"
    bun build "$PLUGIN_CURSOR_DIR/src/hooks.ts" \
        --outfile "$PLUGIN_CURSOR_DIR/dist/hooks.js" \
        --target=bun

    if [ ! -f "$PLUGIN_CURSOR_DIR/dist/hooks.js" ]; then
        echo -e "${RED}Error: Cursor hook build failed${NC}"
        exit 1
    fi
}

install_opencode() {
    echo -e "${GREEN}Installing Sibyl plugin for OpenCode...${NC}"

    build_packages
    bundle_opencode_plugin

    mkdir -p "$OPENCODE_PLUGINS"
    mkdir -p "$OPENCODE_CONFIG"

    echo -e "${YELLOW}Setting up OpenCode dependencies...${NC}"
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

    echo -e "${YELLOW}Copying plugin to $OPENCODE_PLUGINS/$OPENCODE_PLUGIN_NAME...${NC}"
    cp "$PLUGIN_OPENCODE_DIR/dist/index.js" "$OPENCODE_PLUGINS/$OPENCODE_PLUGIN_NAME"

    echo ""
    echo -e "${GREEN}✓ Sibyl plugin installed for OpenCode!${NC}"
    echo ""
    echo "The plugin provides the following tools:"
    echo "  - memory_recall: Search Wiki Pages and synthesize answers"
    echo "  - memory_list: List all Wiki Pages"
    echo "  - memory_query: Query Wiki Pages with questions"
    echo ""
    echo "Configuration via environment variables:"
    echo "  SIBYL_SERVER_URL    - Sibyl server URL (default: http://localhost:3000)"
    echo "  SIBYL_API_KEY       - API key for authentication"
    echo "  SIBYL_AUTO_SAVE     - Auto-save sessions to Sibyl (default: true)"
    echo "  SIBYL_AUTO_SAVE_THRESHOLD - Min messages before auto-save (default: 1)"
}

uninstall_opencode() {
    echo -e "${YELLOW}Uninstalling Sibyl plugin from OpenCode...${NC}"

    if [ -f "$OPENCODE_PLUGINS/$OPENCODE_PLUGIN_NAME" ]; then
        rm "$OPENCODE_PLUGINS/$OPENCODE_PLUGIN_NAME"
        echo -e "${GREEN}✓ Plugin file removed${NC}"
    else
        echo -e "${YELLOW}Plugin file not found${NC}"
    fi

    if [ -f "$OPENCODE_PLUGINS/sibyl-plugin.d.ts" ]; then
        rm "$OPENCODE_PLUGINS/sibyl-plugin.d.ts"
    fi

    echo -e "${GREEN}✓ Sibyl plugin uninstalled from OpenCode${NC}"
}

install_cursor() {
    echo -e "${GREEN}Installing Sibyl plugin for Cursor...${NC}"

    build_packages
    bundle_cursor_hook

    mkdir -p "$CURSOR_HOOKS"
    mkdir -p "$CURSOR_CONFIG"

    echo -e "${YELLOW}Copying hook script to $CURSOR_HOOKS/$CURSOR_HOOK_NAME...${NC}"
    cp "$PLUGIN_CURSOR_DIR/dist/hooks.js" "$CURSOR_HOOKS/$CURSOR_HOOK_NAME"
    chmod +x "$CURSOR_HOOKS/$CURSOR_HOOK_NAME"

    echo -e "${YELLOW}Configuring Cursor hooks.json...${NC}"
    if [ -f "$CURSOR_HOOKS_CONFIG" ]; then
        echo -e "${YELLOW}Existing hooks.json found. Sibyl hooks will be added alongside existing hooks.${NC}"
        
        if grep -q "sibyl-hook.js" "$CURSOR_HOOKS_CONFIG"; then
            echo -e "${GREEN}✓ Sibyl hooks already configured in hooks.json${NC}"
        else
            echo -e "${YELLOW}Adding Sibyl hooks to existing hooks.json...${NC}"
            python3 -c "
import json
import sys

with open('$CURSOR_HOOKS_CONFIG', 'r') as f:
    config = json.load(f)

if 'hooks' not in config:
    config['hooks'] = {}

sibyl_hooks = [
    {'command': '~/.cursor/hooks/sibyl-hook.js'}
]

for event in ['sessionStart', 'sessionEnd']:
    if event not in config['hooks']:
        config['hooks'][event] = []
    
    existing_commands = [h.get('command', '') for h in config['hooks'][event]]
    if 'sibyl-hook.js' not in ' '.join(existing_commands):
        config['hooks'][event].extend(sibyl_hooks)

with open('$CURSOR_HOOKS_CONFIG', 'w') as f:
    json.dump(config, f, indent=2)
"
            echo -e "${GREEN}✓ Sibyl hooks added to hooks.json${NC}"
        fi
    else
        echo -e "${YELLOW}Creating new hooks.json...${NC}"
        cat > "$CURSOR_HOOKS_CONFIG" << 'HOOKEOF'
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      {
        "command": "~/.cursor/hooks/sibyl-hook.js"
      }
    ],
    "sessionEnd": [
      {
        "command": "~/.cursor/hooks/sibyl-hook.js"
      }
    ]
  }
}
HOOKEOF
        echo -e "${GREEN}✓ Created hooks.json with Sibyl hooks${NC}"
    fi

    echo ""
    echo -e "${GREEN}✓ Sibyl plugin installed for Cursor!${NC}"
    echo ""
    echo "Hooks installed:"
    echo "  - sessionStart: Initialize Sibyl session tracking"
    echo "  - sessionEnd: Sync transcript to Sibyl knowledge base"
    echo ""
    echo "Configuration via environment variables:"
    echo "  SIBYL_SERVER_URL    - Sibyl server URL (default: http://localhost:3000)"
    echo "  SIBYL_API_KEY       - API key for authentication"
    echo "  SIBYL_AUTO_SAVE_THRESHOLD - Min messages before sync (default: 1)"
    echo ""
    echo "Hook script location: $CURSOR_HOOKS/$CURSOR_HOOK_NAME"
}

uninstall_cursor() {
    echo -e "${YELLOW}Uninstalling Sibyl plugin from Cursor...${NC}"

    if [ -f "$CURSOR_HOOKS/$CURSOR_HOOK_NAME" ]; then
        rm "$CURSOR_HOOKS/$CURSOR_HOOK_NAME"
        echo -e "${GREEN}✓ Hook script removed${NC}"
    else
        echo -e "${YELLOW}Hook script not found${NC}"
    fi

    if [ -f "$CURSOR_HOOKS_CONFIG" ]; then
        echo -e "${YELLOW}Removing Sibyl hooks from hooks.json...${NC}"
        python3 -c "
import json

with open('$CURSOR_HOOKS_CONFIG', 'r') as f:
    config = json.load(f)

if 'hooks' in config:
    for event in ['sessionStart', 'sessionEnd']:
        if event in config['hooks']:
            config['hooks'][event] = [
                h for h in config['hooks'][event]
                if 'sibyl-hook.js' not in h.get('command', '')
            ]
            if not config['hooks'][event]:
                del config['hooks'][event]

with open('$CURSOR_HOOKS_CONFIG', 'w') as f:
    json.dump(config, f, indent=2)
" || {
            echo -e "${YELLOW}Could not modify hooks.json. You may need to manually remove Sibyl hooks.${NC}"
        }
        echo -e "${GREEN}✓ Sibyl hooks removed from hooks.json${NC}"
    fi

    echo -e "${GREEN}✓ Sibyl plugin uninstalled from Cursor${NC}"
}

COMMAND="${1:-}"
HARNESS="${2:-opencode}"

if [ -z "$COMMAND" ]; then
    usage
fi

case "$HARNESS" in
    opencode|cursor)
        ;;
    *)
        echo -e "${RED}Error: Unknown harness '$HARNESS'. Use 'opencode' or 'cursor'.${NC}"
        usage
        ;;
esac

case "$COMMAND" in
    uninstall)
        case "$HARNESS" in
            opencode) uninstall_opencode ;;
            cursor) uninstall_cursor ;;
        esac
        exit 0
        ;;
    install|update)
        ;;
    *)
        usage
        ;;
esac

case "$HARNESS" in
    opencode) install_opencode ;;
    cursor) install_cursor ;;
esac