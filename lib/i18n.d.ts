interface I18nConfig {
  defaultLocale: string;
  dir: string;
}

declare class MicroI18n {
  config: I18nConfig;

  constructor();

  load(config: I18nConfig): Promise<void>;
  __(locale: string | undefined, key: string, ...args: any[]): string;
}

export default MicroI18n;
