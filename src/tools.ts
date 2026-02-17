import { z } from 'zod';
import { SshClient } from './ssh-client';

export const TOOLS = {
    execute_command: {
        name: 'execute_command',
        description: 'Execute a command on the OpenWrt router',
        schema: z.object({
            command: z.string().describe('The command to execute (e.g. "ls -la /tmp")'),
        }),
    },
    get_system_info: {
        name: 'get_system_info',
        description: 'Get system information (CPU, memory, uptime)',
        schema: z.object({}),
    },
    read_file: {
        name: 'read_file',
        description: 'Read a file from the router',
        schema: z.object({
            path: z.string().describe('Absolute path to the file to read'),
        }),
    },
    write_file: {
        name: 'write_file',
        description: 'Write content to a file on the router',
        schema: z.object({
            path: z.string().describe('Absolute path to the file to write'),
            content: z.string().describe('Content to write to the file'),
        }),
    },
    list_interfaces: {
        name: 'list_interfaces',
        description: 'List network interfaces and their status',
        schema: z.object({}),
    },
};

export async function handleToolCall(name: string, args: any, sshClient: SshClient): Promise<any> {
    switch (name) {
        case 'execute_command': {
            const { command } = args;
            const result = await sshClient.exec(command);
            return {
                content: [
                    {
                        type: 'text',
                        text: `Stdout:\n${result.stdout}\n\nStderr:\n${result.stderr}`,
                    },
                ],
            };
        }

        case 'get_system_info': {
            // Run multiple commands to gather info
            const uptime = await sshClient.exec('uptime');
            const memory = await sshClient.exec('free -m');
            const cpu = await sshClient.exec('cat /proc/cpuinfo | grep "model name" | head -n 1');

            return {
                content: [
                    {
                        type: 'text',
                        text: `System Info:
Uptime: ${uptime.stdout.trim()}
Memory:
${memory.stdout.trim()}
CPU: ${cpu.stdout.trim() || 'Unknown'}`,
                    },
                ],
            };
        }

        case 'read_file': {
            const { path } = args;
            // Use cat to read file. simple and effective for text files.
            // Ideally we should use sftp but ssh exec is easier for now.
            const result = await sshClient.exec(`cat "${path}"`);
            if (result.stderr) {
                throw new Error(`Failed to read file: ${result.stderr}`);
            }
            return {
                content: [
                    {
                        type: 'text',
                        text: result.stdout,
                    },
                ],
            };
        }

        case 'write_file': {
            const { path, content } = args;
            // We need to be careful with special characters. 
            // A simple way is to use base64 to avoid escaping issues.
            // echo "content_base64" | base64 -d > path
            const base64Content = Buffer.from(content).toString('base64');
            const command = `echo "${base64Content}" | base64 -d > "${path}"`;

            const result = await sshClient.exec(command);
            if (result.stderr) {
                throw new Error(`Failed to write file: ${result.stderr}`);
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: `Successfully wrote to ${path}`,
                    },
                ],
            };
        }

        case 'list_interfaces': {
            // Use ubus to get network status if available, fallback to ifconfig or ip a
            try {
                const ubusResult = await sshClient.exec('ubus call network.interface dump');
                if (ubusResult.stdout) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: ubusResult.stdout,
                            }
                        ]
                    }
                }
            } catch (e) {
                // ignore
            }

            const result = await sshClient.exec('ifconfig');
            return {
                content: [
                    {
                        type: 'text',
                        text: result.stdout,
                    }
                ]
            }
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}
