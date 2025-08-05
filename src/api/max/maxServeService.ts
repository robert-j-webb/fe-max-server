import { execa, ResultPromise } from "execa";
import { readFileSync } from "node:fs";
import find, { ProcessInfo, FindConfig } from "find-process";

class MaxServeService {
  private hasMaxStarted = false;
  private process: ResultPromise<{
    shell: string;
    cleanup: false;
    forceKillAfterDelay: false;
    localDir: string;
    all: true;
  }> | null = null;
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

    if (this.process) {
      this.process.kill();
    }
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
    })`${command}`;
    this.hasMaxStarted = true;
    this.monitorProcess();
  }

  private async monitorProcess() {
    for await (const line of this.process!.iterable({ from: "all" })) {
      // if (!isDev && line.includes("No GPUs available, falling back to CPU")) {
      //   this.error = "No GPUs found!";
      //   this.process?.kill();
      // }
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
      if (line.includes("Value error, port 8000 is already in use")) {
        this.error = "Port 8000 is already in use! Attempting to kill!";
        this.killByPort();
      }
      this.stdout.push(line);
    }
  }

  private async killByPort() {
    const list = await find("port", 8000);
    if (list.length > 0) {
      await execa`kill -9 ${list[0].pid}`;
    } else {
      console.log("Could not find process running on port 8000");
    }
  }

  public getStdout() {
    return this.stdout;
  }

  public getStatus() {
    return {
      error: this.error,
      isServerReady: this.isServerReady,
      hasMaxStarted: this.hasMaxStarted,
      maxVersion: this.maxVersion,
      hasModelDownloadStarted: this.hasModelDownloadStarted,
      hasModelCompilingStarted: this.hasModelCompilingStarted,
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
    if (this.process) {
      this.process.kill();
    } else {
      try {
        const response = await execa`lsof -i :8000`;
        const pid = response.stdout.split("\n")[1].split(" ")[1];
        await execa`kill -9 ${pid}`;
      } catch (e) {
        console.log("Tried to kill process", e);
      }
    }
    if (this.heartBeatInterval) {
      clearInterval(this.heartBeatInterval);
      this.heartBeatInterval = null;
    }
  }
}

export const maxServeService = new MaxServeService();
