import path from "path";
import Koa from "koa";
import Router, { RouterContext } from "koa-router";
import bodyParser from "koa-bodyparser";
import cors from "@koa/cors";
import serve from "koa-static";
import mount from "koa-mount";
import _ from "lodash";
import Joi from "joi";
import { createServer, Server } from "http";
import dotenv from "dotenv";
import fs from "fs";

import MicroModule from "./module.js";
import MicroConfigLoader from "./config.js";
import MicroI18n from "./i18n.js";
import {
  createUploadMiddleware,
  applyUploadMiddleware,
  UploadPathConfig,
} from "./middlewares/index.js";

interface RequestBody {
  serviceApiKey?: string;
  accessKey?: string;
  signature?: string;
  locale?: string;
  data?: Record<string, any>;
  from?: string;
  __?: (...args: any[]) => string;
  _files?: any[];
  [key: string]: any;
}

interface StaticPathConfig {
  path: string;
  alias?: string;
  options?: any;
}

interface MicroConfig {
  port: number;
  projectDir: string;
  configDir: string;
  servicesDir: string;
  allowHeaders: string[];
  env?: string;
  upload: {
    enabled: boolean;
    paths: UploadPathConfig[];
    multer?: any;
  };
  static: {
    enabled: boolean;
    paths: StaticPathConfig[];
    ejs: {
      enabled: boolean;
    };
  };
  restriction: {
    serviceApiKey: string | null;
  };
  locales: {
    defaultLocale: string;
  };
  [key: string]: any;
}

class MicroServer {
  #httpServer: Server | null = null;
  static context: Record<string, any> = {};

  microModule: MicroModule;
  microConfig: MicroConfigLoader;
  microI18n: MicroI18n;
  config: MicroConfig;
  app: Koa | null;

  defaultConfig: MicroConfig;

  constructor() {
    this.microModule = new MicroModule(this);
    this.microConfig = new MicroConfigLoader();
    this.microI18n = new MicroI18n();
    this.config = {} as MicroConfig;

    this.defaultConfig = {
      port: 8080,
      projectDir: process.cwd(),
      configDir: "./config",
      servicesDir: "./services",
      allowHeaders: ["serviceApiKey", "accessKey", "signature", "locale"],
      upload: {
        enabled: true,
        paths: [
          {
            path: /^\/api\/user\/profile\/upload$/,
            allowedTypes: ["image/jpeg", "image/png"],
            maxFileSize: 2 * 1024 * 1024, // 2MB
            maxFiles: 1,
          },
        ],
      },
      static: {
        enabled: true,
        paths: [
          {
            path: "client",
          },
        ],
        ejs: {
          enabled: false,
        },
      },
      restriction: {
        serviceApiKey: null,
      },
      locales: {
        defaultLocale: "en-US",
      },
    };

    this.app = null;
  }

  async loadModules(): Promise<void> {
    await this.microModule.load(
      path.join(this.config.projectDir, this.config.servicesDir)
    );
  }

  #getReqBody(ctx: Koa.Context | RouterContext): RequestBody {
    let reqHeader = _.pick(
      ctx.query as Record<string, any>,
      this.config.allowHeaders
    );
    let reqData = _.omit(
      ctx.query as Record<string, any>,
      this.config.allowHeaders
    );

    reqData = {
      ...reqData,
      ...(ctx.request.body && _.isPlainObject((ctx.request.body as any).data)
        ? (ctx.request.body as any).data
        : {}),
      ...("files" in ctx.request && ctx.request.files
        ? { _files: ctx.request.files }
        : null),
    };

    reqHeader = {
      ...reqHeader,
      ..._.pick(ctx.request.body || {}, this.config.allowHeaders),
    };
    return {
      ...reqHeader,
      data: reqData,
    };
  }

  async loadConfig(config: Partial<MicroConfig> = {}): Promise<MicroConfig> {
    const projectDir = config.projectDir ?? this.defaultConfig.projectDir;
    dotenv.config({
      path: path.join(projectDir, ".env"),
    });
    const configDir = config.configDir ?? this.defaultConfig.configDir;
    const loadedConfig = await this.microConfig.load(projectDir, configDir, {
      env: config.env ?? process.env.SERVER_ENV,
      projectDir,
      configDir,
    });

    this.config = _.merge({}, this.defaultConfig, loadedConfig);

    await this.microI18n.load({
      defaultLocale: this.config.locales.defaultLocale,
      dir: path.join(projectDir, "locales"),
    });

    return this.config;
  }

  async start(): Promise<void> {
    await this.loadModules();
    await this.startHttpServer();
  }

  async call(
    service: string,
    logic: string,
    func: string,
    reqBody: RequestBody
  ): Promise<any> {
    return this.#callFunc(service, logic, func, reqBody, "server");
  }

  #verifyCallRequest(service: string, logic: string, func: string): boolean {
    return [service, logic, func].every((name) =>
      /^[a-zA-Z0-9]\w{0,49}$/.test(name)
    );
  }

  async #callFunc(
    service: string,
    logic: string,
    func: string,
    reqBody: RequestBody,
    from = "api"
  ): Promise<any> {
    const funcInfo = await this.microModule.getFunc(service, logic, func, {
      ...reqBody,
      from,
    });

    if (!funcInfo) {
      throw new Error("Cannot found this function");
    }

    if (
      this.config.restriction.serviceApiKey != null &&
      [
        funcInfo.modifier,
        funcInfo.service?.modifier,
        funcInfo.logic?.modifier,
      ].some((d) => d === "$")
    ) {
      if (this.config.restriction.serviceApiKey !== reqBody.serviceApiKey) {
        throw new Error("Invalid service API key");
      }
    }

    const result = await funcInfo.fn({
      ...reqBody,
      from,
    });

    return result;
  }

  async startHttpServer(): Promise<void> {
    const app = (this.app = new Koa());
    const httpServer = createServer(app.callback());
    const router = new Router();

    // Serve static files if enabled
    if (this.config.static.enabled && this.config.static.paths.length > 0) {
      for (const pathConfig of this.config.static.paths) {
        const staticPath = path.isAbsolute(pathConfig.path)
          ? pathConfig.path
          : path.join(this.config.projectDir, pathConfig.path);

        if (pathConfig.alias) {
          // Mount with alias
          app.use(
            mount(pathConfig.alias, serve(staticPath, pathConfig.options || {}))
          );
        } else {
          // Mount directly
          app.use(serve(staticPath, pathConfig.options || {}));
        }
      }
    }

    // Set up upload middleware
    const multerMiddleware = await createUploadMiddleware({
      enabled: this.config.upload.enabled,
      projectDir: this.config.projectDir,
      paths: this.config.upload.paths,
      multerOptions: this.config.upload.multer,
    });

    app.use(cors());
    app.use(bodyParser());

    app.use(async (ctx: Koa.Context, next) => {
      try {
        await next();
      } catch (e: any) {
        // Check if ctx contains required RouterContext properties
        let reqBody: RequestBody = { data: {} };
        try {
          reqBody = this.#getReqBody(ctx);
        } catch (error) {
          console.error("Failed to get request body:", error);
        }

        console.error(e.message, e.stack);
        if (e instanceof Joi.ValidationError) {
          ctx.body = {
            success: false,
            data: {
              code: 400,
              message: this.microI18n.__(reqBody.locale, "sys.bad_request"),
              details: e.details,
            },
          };
        }
        ctx.body = {
          success: false,
          data: {
            code: e.code ?? 500,
            message:
              this.config.env === "production"
                ? this.microI18n.__(reqBody.locale, "sys.internal_server_error")
                : e.message,
            ...(e.details ? { details: e.details } : {}),
          },
        };
      }
    });

    // Apply upload middleware to the router if enabled
    if (this.config.upload.enabled) {
      applyUploadMiddleware(router, multerMiddleware, this.config.upload.paths);
    }

    router.all("/api/:service/:logic/:func", async (ctx) => {
      const { service, logic, func } = ctx.params;

      if (!this.#verifyCallRequest(service, logic, func)) {
        throw new Error("Invalid service.");
      }
      const reqBody = this.#getReqBody(ctx);

      const result = await this.#callFunc(service, logic, func, {
        ...reqBody,
        from: "api",
        __: (key: string, ...args: any[]) =>
          this.microI18n.__(reqBody.locale, key),
      });

      if (typeof result === "function") {
        return await result(ctx);
      }

      ctx.body = {
        success: true,
        data: result ?? {},
      };
    });

    app.use(router.routes()).use(router.allowedMethods());

    httpServer.listen(this.config.port);

    console.log(`listening server on port: ${this.config.port}`);

    this.#httpServer = httpServer;
  }
}

export default MicroServer;
