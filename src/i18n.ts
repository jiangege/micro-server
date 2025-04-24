import { readdir } from "fs/promises";
import _ from "lodash";
import path from "path";
import { pathToFileURL } from "url";

interface I18nConfig {
  defaultLocale: string;
  dir: string;
}

class MicroI18n {
  #translations: Record<string, Record<string, string>>;
  config: I18nConfig;

  constructor() {
    this.#translations = {};
    this.config = {} as I18nConfig;
  }

  async load(config: I18nConfig): Promise<void> {
    this.config = config;
    const files = await readdir(config.dir);

    for (const file of files) {
      const locale = path.basename(file, path.extname(file));
      const fileUrl = pathToFileURL(path.join(config.dir, file)).toString();
      const translation = await import(fileUrl);
      this.#translations[locale] = {
        ...this.#translations[locale],
        ...translation.default,
      };
    }
  }

  __(locale: string | undefined, key: string): string {
    if (locale && !/^(\w|-)*$/.test(locale)) {
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
