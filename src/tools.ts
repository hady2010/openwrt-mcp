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
    change_file_permissions: {
        name: 'change_file_permissions',
        description: 'Change permissions of a file or directory (chmod)',
        schema: z.object({
            path: z.string().describe('Absolute path to the file or directory'),
            mode: z.string().describe('Permission mode (e.g. "755", "+x")'),
        }),
    },
    change_file_owner: {
        name: 'change_file_owner',
        description: 'Change owner and/or group of a file or directory (chown)',
        schema: z.object({
            path: z.string().describe('Absolute path to the file or directory'),
            owner: z.string().describe('New owner and/or group (e.g. "root:root", "nobody")'),
        }),
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

        case 'change_file_permissions': {
            const { path, mode } = args;
            // Validate mode to prevent basic command injection since it goes into shell.
            // Allow modes like "755", "u+x", "g-w"
            if (!/^[0-7]{3,4}$|^[ugoa]*[-+=][rwxXst]*$/.test(mode)) {
                throw new Error(`Invalid permission mode format: ${mode}`);
            }

            const safePath = path.replace(/"/g, '\\"');
            const result = await sshClient.exec(`chmod ${mode} "${safePath}"`);
            if (result.stderr && !result.stderr.toLowerCase().includes('operation not permitted')) {
                throw new Error(`Failed to change permissions: ${result.stderr}`);
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: `Successfully changed permissions of ${path} to ${mode}\n${result.stdout ? `\nStdout:\n${result.stdout}` : ''}${result.stderr ? `\nStderr:\n${result.stderr}` : ''}`.trim(),
                    },
                ],
            };
        }

        case 'change_file_owner': {
            const { path, owner } = args;
            // Validate owner format to avoid injections: user, user:group, :group
            if (!/^[a-zA-Z0-9_.-]+(:[a-zA-Z0-9_.-]+)?$/.test(owner) && !/^:[a-zA-Z0-9_.-]+$/.test(owner)) {
                throw new Error(`Invalid owner format: ${owner}`);
            }

            const safePath = path.replace(/"/g, '\\"');
            const result = await sshClient.exec(`chown ${owner} "${safePath}"`);
            if (result.stderr && !result.stderr.toLowerCase().includes('operation not permitted')) {
                throw new Error(`Failed to change owner: ${result.stderr}`);
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: `Successfully changed owner of ${path} to ${owner}\n${result.stdout ? `\nStdout:\n${result.stdout}` : ''}${result.stderr ? `\nStderr:\n${result.stderr}` : ''}`.trim(),
                    },
                ],
            };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}
