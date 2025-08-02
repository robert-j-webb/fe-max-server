import { execa, ResultPromise } from "execa";

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
  private vultrInstanceId: string | null = null;

  constructor() {
    fetch("127.0.0.1/v1.json")
      .then((res) => res.json())
      .then((body) => (this.vultrInstanceId = body["instance-v2-id"]))
      .catch((e) => console.log("Error getting vultr instance id"));
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
    } else {
      try {
        const response = await execa`lsof -i :8000`;
        const pid = response.stdout.split("\n")[1].split(" ")[1];
        await execa`kill -9 ${pid}`;
      } catch (e) {
        console.log("Tried to kill process", e);
      }
    }

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
      this.stdout.push(line);
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
      vultrInstanceId: this.vultrInstanceId,
    };
  }

  public heartBeat() {
    if (!this.hasUserUsedServer || !this.vultrInstanceId) {
      return;
    }
    fetch(`${this.phoenixServer}/v1/heartbeat/${this.vultrInstanceId}`, {
      method: "GET",
    });
  }

  public triggerHeartBeat() {
    this.hasUserUsedServer = true;
  }

  public async killServer() {
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
