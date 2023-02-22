const path = require("path");
const fs = require("fs");
const _ = require("lodash");

class MicroConfigLoader {
  constructor() {
    this.config = {};
  }

  #loadEnvFile(rootDir, configDir, fileName) {
    try {
      const getConfig = require(path.join(rootDir, configDir, fileName));
      _.merge(this.config, getConfig(this.config));
      console.log(`loaded ${fileName}`);
    } catch (e) {}
  }

  load(rootDir, configDir, runtimeConfig = {}) {
    _.merge(this.config, {
      ...runtimeConfig,
    });

    try {
      const configStat = fs.statSync(path.join(rootDir, `${configDir}.js`));
      if (configStat.isFile()) {
        this.#loadEnvFile(rootDir, "", `${configDir}.js`);
        return this.config;
      }
    } catch (e) {}

    this.#loadEnvFile(rootDir, configDir, "config.default.js");
    const env = this.config.env ?? "local";
    this.#loadEnvFile(rootDir, configDir, `config.${env}.js`);

    return this.config;
  }
}

module.exports = MicroConfigLoader;
