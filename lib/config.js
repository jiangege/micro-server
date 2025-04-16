import path from "path";
import { promises as fs } from "fs";
import _ from "lodash";
import { pathToFileURL } from "url";

class MicroConfigLoader {
  constructor() {
    this.config = {};
  }

  async #loadEnvFile(rootDir, configDir, fileName) {
    try {
      const configModule = await import(
        pathToFileURL(path.join(rootDir, configDir, fileName))
      );
      const getConfig = configModule.default;
      _.merge(this.config, getConfig(this.config));
      console.log(`loaded ${fileName}`);
    } catch (e) {}
  }

  async load(rootDir, configDir, runtimeConfig = {}) {
    _.merge(this.config, {
      ...runtimeConfig,
    });

    try {
      const configStat = await fs.stat(path.join(rootDir, `${configDir}.js`));
      if (configStat.isFile()) {
        await this.#loadEnvFile(rootDir, "", `${configDir}.js`);
        return this.config;
      }
    } catch (e) {}

    await this.#loadEnvFile(rootDir, configDir, "config.default.js");
    const env = this.config.env ?? "local";
    await this.#loadEnvFile(rootDir, configDir, `config.${env}.js`);

    return this.config;
  }
}

export default MicroConfigLoader;
