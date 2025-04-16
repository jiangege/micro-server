import MicroServer from "./server";

interface ModuleInfo {
  name: string;
  modifier?: string;
  children?: ModuleInfo[];
  exports?: Record<string, FunctionInfo>;
}

interface FunctionInfo {
  name: string;
  modifier?: string;
  fn: (...args: any[]) => Promise<any>;
  service?: ModuleInfo;
  logic?: ModuleInfo;
}

declare class MicroModule {
  microServer: MicroServer;
  cache: Record<string, any>;
  serviceInfo: ModuleInfo | null;

  constructor(microServer: MicroServer);

  parseModifier(text: string): { name: string; modifier?: string } | null;
  parseInfo(
    rootPath: string,
    depth?: number,
    index?: number
  ): Promise<ModuleInfo | null>;
  load(serviceDirPath: string): Promise<ModuleInfo | null>;
  getFunc(
    service: string,
    logic: string,
    func: string
  ): Promise<FunctionInfo | null>;
}

export default MicroModule;
