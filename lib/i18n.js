const fs = require("fs");
const _ = require("lodash");
const path = require("path");

class MicroI18n {
  #translations;
  constructor() {
    this.#translations = {};
  }

  async load(config) {
    const files = fs.readdirSync(config.dir);

    for (const file of files) {
      const locale = path.basename(file, path.extname(file));
      const translation = require(path.join(config.dir, file));
      this.#translations[locale] = {
        ...this.#translations[locale],
        ...translation,
      };
    }
  }

  __(locale, key) {
    return _.get(this.#translations, `${locale}.${key}`, key);
  }
}

module.exports = MicroI18n;
