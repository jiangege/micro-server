interface ConfigRuntimeOptions {
  env?: string;
  projectDir: string;
  configDir: string;
  [key: string]: any;
}

declare class MicroConfigLoader {
  config: Record<string, any>;

  constructor();

  load(
    rootDir: string,
    configDir: string,
    runtimeConfig?: ConfigRuntimeOptions
  ): Promise<Record<string, any>>;
}

export default MicroConfigLoader;
