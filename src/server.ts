import path from "path";
import Koa from "koa";
import Router from "koa-router";
import bodyParser from "koa-bodyparser";
import cors from "@koa/cors";
import multer from "@koa/multer";
import serve from "koa-static";
import views from "koa-views";
import _ from "lodash";
import Joi from "joi";
import { createServer, Server } from "http";
import dotenv from "dotenv";

import MicroModule from "./module.js";
import MicroConfigLoader from "./config.js";
import MicroI18n from "./i18n.js";

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

interface MicroConfig {
  port: number;
  projectDir: string;
  configDir: string;
  servicesDir: string;
  allowHeaders: string[];
  env?: string;
  upload: {
    enabled: boolean;
    allowedPaths: RegExp[];
    multer?: any;
  };
  static: {
    enabled: boolean;
    dirName: string;
    ejs: {
      enabled: boolean;
      extension: string;
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
        allowedPaths: [/^.*/],
      },
      static: {
        enabled: true,
        dirName: "client",
        ejs: {
          enabled: true,
          extension: "html",
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

  #getReqBody(ctx: Koa.Context): RequestBody {
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
    let multerMiddleware: any;
    const app = (this.app = new Koa());
    const httpServer = createServer(app.callback());
    const router = new Router();

    if (this.config.upload.enabled) {
      multerMiddleware = multer({
        ...this.config.upload.multer,
      });
    }

    const clientDir = path.join(
      this.config.projectDir,
      this.config.static.dirName
    );

    // Setup EJS templating support
    if (this.config.static.enabled && this.config.static.ejs.enabled) {
      app.use(
        views(clientDir, {
          extension: this.config.static.ejs.extension,
          map: {
            html: "ejs",
          },
        })
      );

      // Add a middleware to render HTML files with EJS
      app.use(async (ctx, next) => {
        if (
          ctx.path.endsWith(".html") ||
          ctx.path === "/" ||
          ctx.path.endsWith("/")
        ) {
          try {
            let viewPath = ctx.path;

            // Handle root or directory paths
            if (viewPath === "/" || viewPath.endsWith("/")) {
              viewPath = viewPath + "index";
            }

            // Remove .html extension if present
            if (viewPath.endsWith(".html")) {
              viewPath = viewPath.substring(0, viewPath.length - 5);
            }

            // Remove leading slash
            if (viewPath.startsWith("/")) {
              viewPath = viewPath.substring(1);
            }

            await ctx.render(viewPath);
          } catch (err) {
            // If rendering fails, continue to next middleware (likely static file serving)
            await next();
          }
        } else {
          await next();
        }
      });
    }

    if (this.config.static.enabled) {
      app.use(serve(clientDir));
    }

    app.use(cors());
    app.use(bodyParser());

    app.use(async (ctx, next) => {
      try {
        await next();
      } catch (e: any) {
        const reqBody = this.#getReqBody(ctx);
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

    router.all(
      "/api/:service/:logic/:func",
      async (ctx, next) => {
        if (this.config.upload.enabled) {
          const isAllowed = this.config.upload.allowedPaths.some(
            (allowedPath) => allowedPath?.test(ctx.path)
          );
          if (isAllowed) {
            return multerMiddleware.array("files")(ctx, next);
          }
        }
        return next();
      },
      async (ctx) => {
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
      }
    );

    app.use(router.routes()).use(router.allowedMethods());

    httpServer.listen(this.config.port);

    console.log(`listening server on port: ${this.config.port}`);

    this.#httpServer = httpServer;
  }
}

export default MicroServer;
