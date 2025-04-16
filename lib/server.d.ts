import { Server } from "http";
import Koa from "koa";
import MicroModule from "./module";
import MicroConfigLoader from "./config";
import MicroI18n from "./i18n";

interface MicroServerConfig {
  port: number;
  projectDir: string;
  configDir: string;
  servicesDir: string;
  allowHeaders: string[];
  upload: {
    enabled: boolean;
    allowedPaths: RegExp[];
    multer?: any;
  };
  static: {
    enabled: boolean;
    dirName: string;
  };
  restriction: {
    serviceApiKey: string | null;
  };
  locales: {
    defaultLocale: string;
  };
  env?: string;
}

interface ReqBody {
  serviceApiKey?: string;
  locale?: string;
  data?: any;
  from?: string;
  __?: (key: string, ...args: any[]) => string;
  [key: string]: any;
}

interface FunctionInfo {
  name: string;
  modifier?: string;
  fn: (reqBody: ReqBody) => Promise<any>;
  service: {
    name: string;
    modifier?: string;
  };
  logic: {
    name: string;
    modifier?: string;
  };
}

declare class MicroServer {
  static config: MicroServerConfig;

  microModule: MicroModule;
  microConfig: MicroConfigLoader;
  microI18n: MicroI18n;
  defaultConfig: MicroServerConfig;
  app: Koa;

  constructor();

  loadModules(): Promise<void>;
  loadConfig(config?: Partial<MicroServerConfig>): Promise<MicroServerConfig>;
  start(): Promise<void>;
  call(
    service: string,
    logic: string,
    func: string,
    reqBody: ReqBody
  ): Promise<any>;
  startHttpServer(): Promise<void>;
}

export default MicroServer;
