import { execa, Options, ResultPromise } from "execa";
import { EventEmitter } from "events";

const isDev = process.env.NODE_ENV === "development";

class MaxServeService extends EventEmitter {
  private hasMaxStarted = false;
  private process: ResultPromise<{
    shell: string;
    cleanup: false;
    forceKillAfterDelay: false;
    localDir: string;
    all: true;
  }> | null = null;
  private maxPath = isDev ? "$HOME/.modular/bin/" : `/root/.venv/bin/`;
  private error: string | null = null;
  private stdout: string[] = [];
  private isServerReady = false;
  private maxVersion: string | null = null;
  private hasModelDownloadStarted = false;
  private hasModelCompilingStarted = false;
  async start(
    modelName: string,
    {
      weightsPath,
      trustRemoteCodeFlag,
    }: { weightsPath?: string; trustRemoteCodeFlag?: boolean }
  ) {
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

    const maxVersion = await execa({
      shell: "bash",
    })`${this.maxPath}max --version`;
    if (maxVersion.exitCode !== 0) {
      this.error = "Max not found!";
      return;
    } else {
      this.maxVersion = maxVersion.stdout;
    }

    let command = `${this.maxPath}max serve --model-path ${modelName}`;

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
    };
  }
}

export const maxServeService = new MaxServeService();
