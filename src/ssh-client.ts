import { Client, ConnectConfig } from 'ssh2';

export class SshClient {
    private client: Client;
    private config: ConnectConfig;
    private connected: boolean = false;

    constructor(config: ConnectConfig) {
        this.client = new Client();
        this.config = config;

        this.client.on('ready', () => {
            this.connected = true;
            console.error('SSH Connection established');
        });

        this.client.on('error', (err) => {
            console.error('SSH Connection error:', err);
            this.connected = false;
        });

        this.client.on('end', () => {
            console.error('SSH Connection ended');
            this.connected = false;
        });

        this.client.on('close', () => {
            console.error('SSH Connection closed');
            this.connected = false;
        });
    }

    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            const onReady = () => {
                cleanup();
                resolve();
            };

            const onError = (err: Error) => {
                cleanup();
                reject(err);
            };

            const cleanup = () => {
                this.client.removeListener('ready', onReady);
                this.client.removeListener('error', onError);
            };

            this.client.on('ready', onReady);
            this.client.on('error', onError);

            try {
                this.client.connect(this.config);
            } catch (error) {
                reject(error);
            }
        });
    }

    async exec(command: string): Promise<{ stdout: string; stderr: string }> {
        if (!this.connected) {
            try {
                console.error('SSH not connected, attempting to reconnect...');
                await this.connect();
            } catch (error) {
                throw new Error(`Failed to reconnect SSH: ${error}`);
            }
        }

        return new Promise((resolve, reject) => {
            this.client.exec(command, (err, stream) => {
                if (err) {
                    return reject(err);
                }

                let stdout = '';
                let stderr = '';

                stream.on('close', (code: any, signal: any) => {
                    if (code !== 0) {
                        // We don't verify exit code strictly here as some commands might return non-zero
                        // but still produce useful output. We let the caller decide.
                        // However, for MCP tools, it's often better to treat non-zero as error or just return empty.
                        // Let's just return what we got.
                    }
                    resolve({ stdout, stderr });
                }).on('data', (data: any) => {
                    stdout += data;
                }).stderr.on('data', (data: any) => {
                    stderr += data;
                });
            });
        });
    }

    disconnect() {
        this.client.end();
    }
}
