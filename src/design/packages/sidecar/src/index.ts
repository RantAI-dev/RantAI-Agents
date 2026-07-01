// WEB-SAFE STUB of @open-design/sidecar.
//
// The upstream package is the generic sidecar runtime: IPC transport (node:net
// unix sockets / windows named pipes), runtime path resolution (node:path),
// JSON runtime files (node:fs/promises) and TCP port allocation. None of that
// exists in the browser, so this vendored copy keeps every exported type and
// function SIGNATURE intact but replaces the runtime implementations with clear
// "desktop/node-only" throws. Imports resolve and typecheck; the browser bundle
// never pulls in Electron/node-only APIs.
//
// If/when a real Node context needs these (e.g. the web app's separately-built
// sidecar entry), point that build back at the upstream implementation.

export type SidecarStampShape = {
  app: string;
  ipc: string;
  mode: string;
  namespace: string;
  source: string;
};

export type SidecarContractDescriptor<TStamp extends SidecarStampShape = SidecarStampShape> = {
  defaults: {
    host: string;
    ipcBase: string;
    namespace: string;
    projectTmpDirName: string;
    windowsPipePrefix: string;
  };
  env: {
    base: string;
    ipcBase: string;
    ipcPath: string;
    namespace: string;
    source: string;
  };
  normalizeApp(app: unknown): TStamp["app"];
  normalizeNamespace(namespace: unknown): string;
  normalizeSource(source: unknown): TStamp["source"];
  normalizeStamp(input: unknown): TStamp;
};

export type NamespaceResolutionOptions<TStamp extends SidecarStampShape = SidecarStampShape> = {
  contract: SidecarContractDescriptor<TStamp>;
  env?: NodeJS.ProcessEnv;
  namespace?: string | null;
};

export type ProjectRuntimePathRequest<TStamp extends SidecarStampShape = SidecarStampShape> = {
  contract: SidecarContractDescriptor<TStamp>;
  projectRoot: string;
  source: TStamp["source"] | string;
};

export type BaseResolutionOptions<TStamp extends SidecarStampShape = SidecarStampShape> = {
  base?: string | null;
  contract: SidecarContractDescriptor<TStamp>;
  env?: NodeJS.ProcessEnv;
  projectRoot?: string;
  source: TStamp["source"] | string;
};

export type RuntimePathRequest<TStamp extends SidecarStampShape = SidecarStampShape> = {
  base: string;
  contract: SidecarContractDescriptor<TStamp>;
  namespace: string;
};

export type RuntimeRootRequest<TStamp extends SidecarStampShape = SidecarStampShape> = RuntimePathRequest<TStamp> & {
  runId: string;
};

export type AppIpcPathRequest<TStamp extends SidecarStampShape = SidecarStampShape> = {
  app: TStamp["app"] | string;
  contract: SidecarContractDescriptor<TStamp>;
  env?: NodeJS.ProcessEnv;
  namespace: string;
};

export type AppRuntimePathRequest<TStamp extends SidecarStampShape = SidecarStampShape> = {
  app: TStamp["app"] | string;
  contract: SidecarContractDescriptor<TStamp>;
  namespaceRoot: string;
};

export type SidecarRuntimeContext<TStamp extends SidecarStampShape = SidecarStampShape> = {
  app: TStamp["app"];
  base: string;
  ipc: string;
  mode: TStamp["mode"];
  namespace: string;
  source: TStamp["source"];
};

export type SidecarLaunchEnvRequest<TStamp extends SidecarStampShape = SidecarStampShape> = {
  base: string;
  contract: SidecarContractDescriptor<TStamp>;
  extraEnv?: NodeJS.ProcessEnv;
  stamp: TStamp;
};

export type BootstrapSidecarRuntimeOptions<TStamp extends SidecarStampShape = SidecarStampShape> = {
  app: TStamp["app"] | string;
  base?: string | null;
  contract: SidecarContractDescriptor<TStamp>;
  projectRoot?: string;
};

export type PortAllocation = {
  port: number;
  source: "dynamic" | "forced";
};

export type PortRequest = {
  host?: string;
  label?: string;
  port?: number | string | null;
  reserved?: Set<number>;
};

export type JsonIpcHandler = (message: any) => unknown | Promise<unknown>;

export type JsonIpcServerHandle = {
  close(): Promise<void>;
};

const DESKTOP_ONLY =
  "@open-design/sidecar is a desktop/node-only package and is not available in the web build";

function unavailable(fn: string): never {
  throw new Error(`${fn}: ${DESKTOP_ONLY}`);
}

export function isWindowsNamedPipePath(_value: unknown): boolean {
  unavailable("isWindowsNamedPipePath");
}

export function normalizeIpcPath(_ipc: unknown): string {
  unavailable("normalizeIpcPath");
}

export function resolveNamespace<TStamp extends SidecarStampShape>(_options: NamespaceResolutionOptions<TStamp>): string {
  unavailable("resolveNamespace");
}

export function resolveProjectRoot(_projectRoot: string): string {
  unavailable("resolveProjectRoot");
}

export function resolveProjectTmpRoot<TStamp extends SidecarStampShape>(_request: {
  contract: SidecarContractDescriptor<TStamp>;
  projectRoot: string;
}): string {
  unavailable("resolveProjectTmpRoot");
}

export function resolveSourceRuntimeRoot<TStamp extends SidecarStampShape>(_request: ProjectRuntimePathRequest<TStamp>): string {
  unavailable("resolveSourceRuntimeRoot");
}

export function resolveSidecarBase<TStamp extends SidecarStampShape>(_options: BaseResolutionOptions<TStamp>): string {
  unavailable("resolveSidecarBase");
}

export function resolveNamespaceRoot<TStamp extends SidecarStampShape>(_request: RuntimePathRequest<TStamp>): string {
  unavailable("resolveNamespaceRoot");
}

export function resolveRuntimeNamespaceRoot<TStamp extends SidecarStampShape>(_request: {
  contract: SidecarContractDescriptor<TStamp>;
  runtime: Pick<SidecarRuntimeContext<TStamp>, "base" | "mode" | "namespace">;
  runtimeMode: TStamp["mode"] | string;
}): string {
  unavailable("resolveRuntimeNamespaceRoot");
}

export function resolveRuntimeRoot<TStamp extends SidecarStampShape>(_request: RuntimeRootRequest<TStamp>): string {
  unavailable("resolveRuntimeRoot");
}

export function resolvePointerPath<TStamp extends SidecarStampShape>(_request: RuntimePathRequest<TStamp>): string {
  unavailable("resolvePointerPath");
}

export function resolveManifestPath(_request: { runtimeRoot: string }): string {
  unavailable("resolveManifestPath");
}

export function resolveLogsDir<TStamp extends SidecarStampShape>(_request: {
  app: TStamp["app"] | string;
  contract: SidecarContractDescriptor<TStamp>;
  runtimeRoot: string;
}): string {
  unavailable("resolveLogsDir");
}

export function resolveLogFilePath<TStamp extends SidecarStampShape>(_request: {
  app: TStamp["app"] | string;
  contract: SidecarContractDescriptor<TStamp>;
  fileName?: string;
  runtimeRoot: string;
}): string {
  unavailable("resolveLogFilePath");
}

export function resolveAppRuntimeDir<TStamp extends SidecarStampShape>(_request: AppRuntimePathRequest<TStamp>): string {
  unavailable("resolveAppRuntimeDir");
}

export function resolveAppRuntimePath<TStamp extends SidecarStampShape>(
  _request: AppRuntimePathRequest<TStamp> & { fileName: string },
): string {
  unavailable("resolveAppRuntimePath");
}

export function resolveAppIpcPath<TStamp extends SidecarStampShape>(_request: AppIpcPathRequest<TStamp>): string {
  unavailable("resolveAppIpcPath");
}

export function createSidecarLaunchEnv<TStamp extends SidecarStampShape>(_request: SidecarLaunchEnvRequest<TStamp>): NodeJS.ProcessEnv {
  unavailable("createSidecarLaunchEnv");
}

export function bootstrapSidecarRuntime<TStamp extends SidecarStampShape>(
  _stampInput: unknown,
  _env: NodeJS.ProcessEnv,
  _options: BootstrapSidecarRuntimeOptions<TStamp>,
): SidecarRuntimeContext<TStamp> {
  unavailable("bootstrapSidecarRuntime");
}

export async function allocatePort(_request: PortRequest = {}): Promise<PortAllocation> {
  unavailable("allocatePort");
}

export async function readJsonFile<T = any>(_filePath: string): Promise<T | null> {
  unavailable("readJsonFile");
}

export async function writeJsonFile(_filePath: string, _payload: unknown): Promise<void> {
  unavailable("writeJsonFile");
}

export async function removeFile(_filePath: string): Promise<void> {
  unavailable("removeFile");
}

export async function removePointerIfCurrent(_pointerPath: string, _runId: string): Promise<void> {
  unavailable("removePointerIfCurrent");
}

export async function createJsonIpcServer(_request: {
  handler: JsonIpcHandler;
  socketPath: string;
}): Promise<JsonIpcServerHandle> {
  unavailable("createJsonIpcServer");
}

export async function requestJsonIpc<T = any>(
  _socketPath: string,
  _payload: unknown,
  _options: { timeoutMs?: number } = {},
): Promise<T> {
  unavailable("requestJsonIpc");
}
