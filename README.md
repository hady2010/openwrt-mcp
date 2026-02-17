# OpenWrt MCP Server

This is a Model Context Protocol (MCP) server that allows you to interact with an OpenWrt router via SSH.

## Prerequisites

- Node.js (v18 or higher)
- SSH access to your OpenWrt router (hostname/IP, username, and password or private key)

## Setup

1.  **Configure**: Copy `.env.example` to `.env` and fill in your router details.
    ```bash
    cp .env.example .env
    ```
    Edit `.env`:
    ```ini
    ROUTER_HOST=192.168.1.1
    ROUTER_USER=root
    ROUTER_PASSWORD=your_password
    # Or use SSH_PRIVATE_KEY
    ```

2.  **Build**:
    ```bash
    npm run build
    ```

## Usage with MCP Client (e.g. Claude Desktop)

Add the following to your MCP client configuration (e.g., `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "openwrt": {
      "command": "node",
      "args": ["/path/to/openwrt-mcp-server/dist/index.js"]
    }
  }
}
```

Make sure to replace `/path/to/openwrt-mcp-server` with the actual absolute path to this directory.

## Available Tools

-   `execute_command`: Execute arbitrary shell commands on the router.
-   `get_system_info`: Get uptime, memory usage, and CPU info.
-   `read_file`: Read a text file from the router.
-   `write_file`: Write content to a file on the router.
-   `list_interfaces`: List network interfaces.

## Security Note

This server allows arbitrary command execution on your router. Ensure it is only used by trusted clients and stored securely.
