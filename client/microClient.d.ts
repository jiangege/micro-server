declare module "microClient" {
  export interface MicroClientOptions {
    baseURL?: string;
    headers?: Record<string, string>;
    timeout?: number;
    locale?: string;
    serviceApiKey?: string;
  }

  export interface MicroClientResponse {
    success: boolean;
    data: any;
    token?: string;
  }

  export default class MicroClient {
    baseURL: string;
    headers: Record<string, string>;
    timeout: number;
    locale: string;
    serviceApiKey: string | null;

    constructor(options?: MicroClientOptions);

    /**
     * Stores the token in local storage
     */
    setToken(token: string): void;

    /**
     * Retrieves the token from local storage
     */
    getToken(): string | null;

    /**
     * Sets the locale for the client
     */
    setLocale(locale: string): MicroClient;

    /**
     * Makes an API call to the specified path
     */
    call(
      path: string,
      data?: Record<string, any>
    ): Promise<MicroClientResponse>;

    /**
     * Uploads one or more files to the specified path
     */
    uploadFile(
      path: string,
      files: File | File[],
      data?: Record<string, any>
    ): Promise<MicroClientResponse>;
  }
}
