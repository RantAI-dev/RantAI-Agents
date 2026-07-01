// WEB-SAFE STUB of @open-design/platform.
//
// The upstream package provides generic OS process primitives built directly
// on node:child_process, node:fs, node:os, node:path and node:timers. Those
// APIs do not exist in the browser, so this vendored copy keeps every exported
// type and function SIGNATURE intact but replaces the runtime implementations
// with clear "desktop/node-only" throws. This lets consumers in the ported
// web SPA import and typecheck against these symbols while guaranteeing the
// browser bundle never pulls in Electron/node-only APIs.
//
// If/when a real Node context needs these (e.g. the web app's separately-built
// sidecar entry), point that build back at the upstream implementation.

import type { ChildProcess } from "node:child_process";

export type CommandInvocation = {
  args: string[];
  command: string;
  windowsVerbatimArguments?: boolean;
};

export type ProcessStampShape = object;

export type ProcessStampField<TStamp extends ProcessStampShape> = Extract<keyof TStamp, string>;

export type ProcessStampContract<
  TStamp extends ProcessStampShape,
  TCriteria extends Partial<TStamp> = Partial<TStamp>,
> = {
  normalizeStamp(input: unknown): TStamp;
  normalizeStampCriteria(input?: unknown): TCriteria;
  stampFields: readonly ProcessStampField<TStamp>[];
  stampFlags: { readonly [K in ProcessStampField<TStamp>]: string };
};

export type CommandInvocationRequest = {
  args?: string[];
  command: string;
  env?: NodeJS.ProcessEnv;
};

export type SpawnProcessRequest = CommandInvocationRequest & {
  cwd?: string;
  detached?: boolean;
  logFd?: number | null;
};

export type ProcessSnapshot = {
  command: string;
  pid: number;
  ppid: number;
};

export type StampedProcessMatchCriteria<TStamp extends ProcessStampShape> = Partial<TStamp>;

export type StopProcessesResult = {
  alreadyStopped: boolean;
  forcedPids: number[];
  matchedPids: number[];
  remainingPids: number[];
  stoppedPids: number[];
};

export type HttpWaitOptions = {
  timeoutMs?: number;
};

export type AtomicCopyFileOptions = {
  overwrite?: boolean;
};

export type AtomicCopyFileResult = {
  bytesCopied: number;
  replaced: boolean;
};

export type RemovePathBestEffortOptions = {
  recursive?: boolean;
};

export type RemovePathBestEffortResult = {
  error?: string;
  removed: boolean;
};

export type SystemProxyCommandRunner = (command: string, args: string[]) => string;

export type ResolveSystemProxyEnvOptions = {
  platform?: NodeJS.Platform;
  runCommand?: SystemProxyCommandRunner;
};

export type WellKnownUserToolchainOptions = {
  home?: string;
  includeSystemBins?: boolean;
  env?: NodeJS.ProcessEnv;
};

const DESKTOP_ONLY =
  "@open-design/platform is a desktop/node-only package and is not available in the web build";

function unavailable(fn: string): never {
  throw new Error(`${fn}: ${DESKTOP_ONLY}`);
}

export function mergeProxyAwareEnv(
  _platform: NodeJS.Platform,
  ..._sources: Array<NodeJS.ProcessEnv | Record<string, string | undefined>>
): NodeJS.ProcessEnv {
  unavailable("mergeProxyAwareEnv");
}

export function parseMacosScutilProxyOutput(
  _stdout: string,
  _platform: NodeJS.Platform = "darwin",
): NodeJS.ProcessEnv {
  unavailable("parseMacosScutilProxyOutput");
}

export function parseWindowsInternetSettingsProxyOutput(
  _input: { proxyEnable: string; proxyOverride?: string; proxyServer?: string },
  _platform: NodeJS.Platform = "win32",
): NodeJS.ProcessEnv {
  unavailable("parseWindowsInternetSettingsProxyOutput");
}

export function resolveSystemProxyEnv(_options: ResolveSystemProxyEnvOptions = {}): NodeJS.ProcessEnv {
  unavailable("resolveSystemProxyEnv");
}

export function createProcessStampArgs<TStamp extends ProcessStampShape>(
  _stamp: TStamp,
  _contract: ProcessStampContract<TStamp>,
): string[] {
  unavailable("createProcessStampArgs");
}

export function readFlagValue(_args: readonly string[], _flagName: string): string | null {
  unavailable("readFlagValue");
}

export function readProcessStamp<TStamp extends ProcessStampShape>(
  _args: readonly string[],
  _contract: ProcessStampContract<TStamp>,
): TStamp | null {
  unavailable("readProcessStamp");
}

export function readProcessStampFromCommand<TStamp extends ProcessStampShape>(
  _command: string,
  _contract: ProcessStampContract<TStamp>,
): TStamp | null {
  unavailable("readProcessStampFromCommand");
}

export function matchesProcessStamp<TStamp extends ProcessStampShape, TCriteria extends Partial<TStamp> = Partial<TStamp>>(
  _stamp: TStamp,
  _criteria: TCriteria | undefined,
  _contract: ProcessStampContract<TStamp, TCriteria>,
): boolean {
  unavailable("matchesProcessStamp");
}

export function matchesStampedProcess<TStamp extends ProcessStampShape, TCriteria extends Partial<TStamp> = Partial<TStamp>>(
  _processInfo: Pick<ProcessSnapshot, "command">,
  _criteria: TCriteria | undefined,
  _contract: ProcessStampContract<TStamp, TCriteria>,
): boolean {
  unavailable("matchesStampedProcess");
}

export function pathContains(_root: string, _target: string): boolean {
  unavailable("pathContains");
}

export async function atomicCopyFile(
  _sourcePath: string,
  _destinationPath: string,
  _options: AtomicCopyFileOptions = {},
): Promise<AtomicCopyFileResult> {
  unavailable("atomicCopyFile");
}

export async function removePathBestEffort(
  _path: string,
  _options: RemovePathBestEffortOptions = {},
): Promise<RemovePathBestEffortResult> {
  unavailable("removePathBestEffort");
}

export function createCommandInvocation(_request: CommandInvocationRequest): CommandInvocation {
  unavailable("createCommandInvocation");
}

export function createPackageManagerInvocation(_args: string[], _env?: NodeJS.ProcessEnv): CommandInvocation {
  unavailable("createPackageManagerInvocation");
}

export async function spawnBackgroundProcess(_request: SpawnProcessRequest): Promise<{ pid: number }> {
  unavailable("spawnBackgroundProcess");
}

export async function spawnLoggedProcess(_request: SpawnProcessRequest): Promise<ChildProcess> {
  unavailable("spawnLoggedProcess");
}

export function isProcessAlive(_pid: number | null | undefined): boolean {
  unavailable("isProcessAlive");
}

export async function waitForProcessExit(_pid: number | null | undefined, _timeoutMs = 5000): Promise<boolean> {
  unavailable("waitForProcessExit");
}

export async function listProcessSnapshots(): Promise<ProcessSnapshot[]> {
  unavailable("listProcessSnapshots");
}

export function collectProcessTreePids(
  _processes: ProcessSnapshot[],
  _rootPids: Array<number | null | undefined>,
): number[] {
  unavailable("collectProcessTreePids");
}

export async function stopProcesses(_pids: Array<number | null | undefined>): Promise<StopProcessesResult> {
  unavailable("stopProcesses");
}

export async function waitForHttpOk(_url: string, _options: HttpWaitOptions = {}): Promise<true> {
  unavailable("waitForHttpOk");
}

export async function readLogTail(_filePath: string, _maxLines = 80): Promise<string[]> {
  unavailable("readLogTail");
}

export function wellKnownUserToolchainBins(_options: WellKnownUserToolchainOptions = {}): string[] {
  unavailable("wellKnownUserToolchainBins");
}
