#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    McpError,
} from '@modelcontextprotocol/sdk/types.js';
import * as dotenv from 'dotenv';
import { SshClient } from './ssh-client.js';
import { TOOLS, handleToolCall } from './tools.js';

dotenv.config();

const ROUTER_HOST = process.env.ROUTER_HOST;
const ROUTER_USER = process.env.ROUTER_USER || 'root';
const ROUTER_PASSWORD = process.env.ROUTER_PASSWORD;
const ROUTER_PORT = parseInt(process.env.ROUTER_PORT || '22', 10);
const SSH_PRIVATE_KEY = process.env.SSH_PRIVATE_KEY;

if (!ROUTER_HOST) {
    console.error('Error: ROUTER_HOST environment variable is required.');
    process.exit(1);
}

if (!ROUTER_PASSWORD && !SSH_PRIVATE_KEY) {
    console.error('Error: Either ROUTER_PASSWORD or SSH_PRIVATE_KEY environment variable is required.');
    process.exit(1);
}

const sshClient = new SshClient({
    host: ROUTER_HOST,
    port: ROUTER_PORT,
    username: ROUTER_USER,
    password: ROUTER_PASSWORD,
    privateKey: SSH_PRIVATE_KEY ? (SSH_PRIVATE_KEY.replace(/\\n/g, '\n')) : undefined,
});

const server = new Server(
    {
        name: 'openwrt-mcp-server',
        version: '1.0.0',
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: Object.values(TOOLS).map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.schema,
        })),
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const tool = Object.values(TOOLS).find((t) => t.name === toolName);

    if (!tool) {
        throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${toolName}`
        );
    }

    try {
        return await handleToolCall(toolName, request.params.arguments, sshClient);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            content: [
                {
                    type: 'text',
                    text: `Error executing tool ${toolName}: ${errorMessage}`,
                },
            ],
            isError: true,
        };
    }
});

async function run() {
    try {
        console.error('Connecting to router...');
        await sshClient.connect();
        console.error('Connected to router.');

        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error('OpenWrt MCP Server running on stdio');
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

run();
