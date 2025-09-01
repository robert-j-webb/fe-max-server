import { execa, ResultPromise } from "execa";
import { readFileSync } from "node:fs";
import findProcess from "find-process";

// CommonJS Module nonsense :)
const find = (findProcess as any).default as typeof findProcess;

const unknownModelRegex = /currently serving '([^']*)'/;
class MaxServeService {
  private hasMaxStarted = false;
  private process: ReturnType<typeof execa> | null = null;
  private error: string | null = null;
  private stdout: string[] = [];
  private isServerReady = false;
  private maxVersion: string | null = null;
  private hasModelDownloadStarted = false;
  private hasModelCompilingStarted = false;
  private hasUserUsedServer = false;
  private phoenixServer: string | null = null;
  private heartBeatInterval: NodeJS.Timeout | null = null;
  private ipAddress: string | null = null;

  constructor() {
    try {
      this.ipAddress = readFileSync("/tmp/ipAddress", "utf-8");
    } catch (e) {
      console.error(e);
    }
  }

  async start(
    modelName: string,
    {
      weightsPath,
      trustRemoteCodeFlag,
      phoenixServer,
    }: {
      weightsPath?: string;
      trustRemoteCodeFlag?: boolean;
      phoenixServer: string;
    }
  ) {
    this.error = null;
    this.stdout = [];
    this.isServerReady = false;
    this.hasMaxStarted = false;
    this.hasModelDownloadStarted = false;
    this.hasModelCompilingStarted = false;
    this.hasUserUsedServer = true;
    this.phoenixServer = phoenixServer;
    if (this.heartBeatInterval) {
      clearInterval(this.heartBeatInterval);
    }

    this.heartBeatInterval = setInterval(() => {
      this.heartBeat();
    }, 1000 * 60 * 5);

    await this.killByPort();

    const maxVersion = await execa({
      shell: "bash",
    })`max --version`;
    if (maxVersion.exitCode !== 0) {
      this.error = "Max not found!";
      return;
    } else {
      this.maxVersion = maxVersion.stdout;
    }

    let command = `max serve --model-path ${modelName}`;

    if (weightsPath) {
      command += ` --weight-path ${weightsPath}`;
    }

    if (trustRemoteCodeFlag) {
      command += " --trust-remote-code";
    }

    this.process = execa({
      shell: "bash",
      cleanup: false,
      forceKillAfterDelay: false,
      all: true,
      env: {
        MAX_SERVE_LOGS_OTLP_LEVEL: "DEBUG",
        MAX_SERVE_DEPLOYMENT_ID: `INTERNAL_MODULAR_CONSOLE`
      },
    })`${command}`;
    this.hasMaxStarted = true;
    this.monitorProcess();
  }

  private async monitorProcess() {
    const processLines = this.process!.iterable({
      binary: false,
      from: "all",
    }) as AsyncIterable<string>;
    for await (const line of processLines) {
      if (line.includes("ready on http://0.0.0.0:8000 ")) {
        this.isServerReady = true;
      }
      if (line.includes("Starting download of model")) {
        this.hasModelDownloadStarted = true;
      }
      if (line.includes("Building and compiling model")) {
        this.hasModelCompilingStarted = true;
      }
      if (line.includes("POST /v1/chat/completions HTTP/1.1")) {
        this.hasUserUsedServer = true;
      }
      if (line.match(unknownModelRegex)) {
        this.error = `Unknown model: ${line.match(unknownModelRegex)?.[1]}`;
      }
      if (line.includes("CUDA_ERROR_OUT_OF_MEMORY")) {
        this.error = "CUDA_ERROR_OUT_OF_MEMORY";
      }
      if (line.includes("Value error, port 8000 is already in use")) {
        this.error = "Port 8000 is already in use! Attempting to kill!";
        this.killByPort();
      }
      if (line.includes("Model worker process is not healthy")) {
        this.error = "Model worker process is not healthy";
        this.killByPort();
      }
      this.stdout.push(line);
    }
  }

  private async killByPort(killCount = 0) {
    if (killCount > 6) {
      throw new Error("Could not kill process running on port 8000");
    }
    try {
      const list = await find("port", 8000);
      if (list.length > 0) {
        await execa`kill -9 ${list[0].pid}`;
        return;
      }
    } catch (e) {
      console.error(e);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
    // Try to kill 5 times before giving up
    this.killByPort(killCount + 1);
  }

  public getStdout() {
    return this.stdout;
  }

  public async getStatus() {
    return {
      error: this.error,
      isServerReady: this.isServerReady,
      hasMaxStarted: this.hasMaxStarted,
      maxVersion: this.maxVersion,
      hasModelDownloadStarted: this.hasModelDownloadStarted,
      hasModelCompilingStarted: this.hasModelCompilingStarted,
      processByPort: JSON.parse(JSON.stringify(await find("port", 8000))),
    };
  }

  public heartBeat() {
    if (!this.hasUserUsedServer) {
      return;
    }
    fetch(`${this.phoenixServer}/v1/heartbeat/${this.ipAddress}`, {
      method: "GET",
    });
  }

  public triggerHeartBeat() {
    this.hasUserUsedServer = true;
  }

  public async killServer() {
    this.error = null;
    this.stdout = [];
    this.isServerReady = false;
    this.hasMaxStarted = false;
    this.hasModelDownloadStarted = false;
    this.hasModelCompilingStarted = false;

    try {
      await this.killByPort();
    } catch (e) {
      console.log("Tried to kill process", e);
    }
    if (this.heartBeatInterval) {
      clearInterval(this.heartBeatInterval);
      this.heartBeatInterval = null;
    }
  }
}

export const maxServeService = new MaxServeService();
