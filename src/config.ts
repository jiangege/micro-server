import path from "path";
import { promises as fs } from "fs";
import _ from "lodash";
import { pathToFileURL } from "url";

interface ConfigOptions {
  env?: string;
  projectDir: string;
  configDir: string;
  [key: string]: any;
}

class MicroConfigLoader {
  config: Record<string, any>;

  constructor() {
    this.config = {};
  }

  async #loadEnvFile(
    rootDir: string,
    configDir: string,
    fileName: string
  ): Promise<void> {
    try {
      const configModule = await import(
        pathToFileURL(path.join(rootDir, configDir, fileName)).toString()
      );
      const getConfig = configModule.default;
      _.merge(this.config, getConfig(this.config));
      console.log(`loaded ${fileName}`);
    } catch (e) {
      // Silently ignore errors when loading config files
    }
  }

  async load(
    rootDir: string,
    configDir: string,
    runtimeConfig: ConfigOptions = {} as ConfigOptions
  ): Promise<Record<string, any>> {
    _.merge(this.config, {
      ...runtimeConfig,
    });

    try {
      const configStat = await fs.stat(path.join(rootDir, `${configDir}.js`));
      if (configStat.isFile()) {
        await this.#loadEnvFile(rootDir, "", `${configDir}.js`);
        return this.config;
      }
    } catch (e) {
      // Silently ignore errors when checking for config file
    }

    await this.#loadEnvFile(rootDir, configDir, "config.default.js");
    const env = this.config.env ?? "local";
    await this.#loadEnvFile(rootDir, configDir, `config.${env}.js`);

    return this.config;
  }
}

export default MicroConfigLoader;
