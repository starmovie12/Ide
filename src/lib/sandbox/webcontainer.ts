/**
 * WebContainer Runner — Phase 5 §4.1
 * Boots a local WebContainer, mounts files, and runs tsc / biome / vitest.
 * Desktop-only. Requires COEP + COOP headers (Bug #B1).
 * Dep: @webcontainer/api v1.6.x
 */

import type { SandboxRunner, FilePatch, TerminalCapture, ParsedError } from './types';
import { parseErrorOutput } from '@/lib/heal/errorParser';

type OutputListener = (chunk: string, stream: 'stdout' | 'stderr') => void;
type ErrorListener = (err: ParsedError) => void;

export class WebContainerRunner implements SandboxRunner {
  private wc: import('@webcontainer/api').WebContainer | null = null;
  private devProcessId: string | null = null;
  private outputListeners: Set<OutputListener> = new Set();
  private errorListeners: Set<ErrorListener> = new Set();
  private booted = false;

  async boot(): Promise<void> {
    if (this.booted) return;
    const { WebContainer } = await import('@webcontainer/api');
    this.wc = await WebContainer.boot();
    this.booted = true;
  }

  async refresh(changedFiles: FilePatch[]): Promise<void> {
    if (!this.wc) throw new Error('WebContainer not booted');
    for (const file of changedFiles) {
      if (file.deleted) {
        try { await this.wc.fs.rm(file.path); } catch { /* ignore missing */ }
      } else {
        const parts = file.path.split('/');
        const dir = parts.slice(0, -1).join('/');
        if (dir) await this.wc.fs.mkdir(dir, { recursive: true });
        await this.wc.fs.writeFile(file.path, file.content);
      }
    }
  }

  async typecheck(): Promise<TerminalCapture> {
    return this.runCommand('npx', ['tsc', '--noEmit', '--pretty', 'false']);
  }

  async lint(): Promise<TerminalCapture> {
    return this.runCommand('npx', ['@biomejs/biome', 'check', 'src/']);
  }

  async test(filePaths?: string[]): Promise<TerminalCapture> {
    const args = ['vitest', 'run'];
    if (filePaths && filePaths.length > 0) {
      args.push('--reporter=verbose', ...filePaths);
    }
    return this.runCommand('npx', args);
  }

  async runDev(): Promise<{ url: string; processId: string }> {
    if (!this.wc) throw new Error('WebContainer not booted');
    const process = await this.wc.spawn('npm', ['run', 'dev']);
    const id = crypto.randomUUID();
    this.devProcessId = id;

    const url = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Dev server timeout')), 30_000);
      this.wc!.on('server-ready', (_port: number, serverUrl: string) => {
        clearTimeout(timeout);
        resolve(serverUrl);
      });
      process.output.pipeTo(
        new WritableStream({
          write: (chunk) => {
            const text = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
            this.outputListeners.forEach((l) => l(text, 'stdout'));
          },
        })
      );
    });

    return { url, processId: id };
  }

  async stopDev(_processId: string): Promise<void> {
    // WebContainers process management — teardown is handled by dispose()
    this.devProcessId = null;
  }

  async runCommand(cmd: string, args: string[]): Promise<TerminalCapture> {
    if (!this.wc) throw new Error('WebContainer not booted');
    const start = Date.now();
    let stdout = '';
    let stderr = '';

    const process = await this.wc.spawn(cmd, args);

    process.output.pipeTo(
      new WritableStream({
        write: (chunk) => {
          const text = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
          stdout += text;
          this.outputListeners.forEach((l) => l(text, 'stdout'));
        },
      })
    );

    const exitCode = await process.exit;
    const durationMs = Date.now() - start;
    const combinedOutput = stdout + '\n' + stderr;
    const errors = parseErrorOutput(combinedOutput, 'tsc');

    errors.forEach((e) => this.errorListeners.forEach((l) => l(e)));

    return { stdout, stderr, exitCode, durationMs, errors };
  }

  onOutput(listener: OutputListener): () => void {
    this.outputListeners.add(listener);
    return () => this.outputListeners.delete(listener);
  }

  onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  async dispose(): Promise<void> {
    if (this.wc) {
      this.wc.teardown();
      this.wc = null;
      this.booted = false;
    }
    this.outputListeners.clear();
    this.errorListeners.clear();
  }
}
