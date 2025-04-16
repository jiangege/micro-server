import { readdir } from "fs/promises";
import _ from "lodash";
import path from "path";
import { pathToFileURL } from "url";

class MicroI18n {
  #translations;
  constructor() {
    this.#translations = {};
  }

  async load(config) {
    this.config = config;
    const files = await readdir(config.dir);

    for (const file of files) {
      const locale = path.basename(file, path.extname(file));
      const fileUrl = pathToFileURL(path.join(config.dir, file));
      const translation = await import(fileUrl);
      this.#translations[locale] = {
        ...this.#translations[locale],
        ...translation.default,
      };
    }
  }

  __(locale, key) {
    if (!/^(\w|-)*$/.test(locale)) {
      return key;
    }

    return _.get(
      this.#translations,
      `['${locale || this.config.defaultLocale}'].${key}`,
      key
    );
  }
}

export default MicroI18n;
