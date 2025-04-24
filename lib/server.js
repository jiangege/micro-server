import path from "path";
import Koa from "koa";
import Router from "koa-router";
import bodyParser from "koa-bodyparser";
import cors from "@koa/cors";
import multer from "@koa/multer";
import serve from "koa-static";
import _ from "lodash";
import Joi from "joi";
import { createServer } from "http";
import dotenv from "dotenv";

import MicroModule from "./module.js";
import MicroConfigLoader from "./config.js";
import MicroI18n from "./i18n.js";

class MicroServer {
  #httpServer = null;
  static config = {};
  constructor() {
    this.microModule = new MicroModule(this);
    this.microConfig = new MicroConfigLoader();
    this.microI18n = new MicroI18n(this);
    this.config = {};

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

  async loadModules() {
    await this.microModule.load(
      path.join(this.config.projectDir, this.config.servicesDir)
    );
  }

  #getReqBody(ctx) {
    let reqHeader = _.pick(ctx.query, this.config.allowHeaders);
    let reqData = _.omit(ctx.query, this.config.allowHeaders);

    reqData = {
      ...reqData,
      ...(_.isPlainObject(ctx.request.body.data) ? ctx.request.body.data : {}),
      ...(ctx.request.files ? { _files: ctx.request.files } : null),
    };

    reqHeader = {
      ...reqHeader,
      ..._.pick(ctx.request.body, this.config.allowHeaders),
    };
    return {
      ...reqHeader,
      data: reqData,
    };
  }

  async loadConfig(config = {}) {
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

  async start() {
    await this.loadModules();
    await this.startHttpServer();
  }

  async call(service, logic, func, reqBody) {
    return this.#callFunc(service, logic, func, reqBody, "server");
  }

  #verifyCallRequest(service, logic, func) {
    return [service, logic, func].every((name) =>
      /^[a-zA-Z0-9]\w{0,49}$/.test(name)
    );
  }

  async #callFunc(service, logic, func, reqBody, from = "api") {
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
        funcInfo.service.modifier,
        funcInfo.logic.modifier,
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

  async startHttpServer() {
    let multerMiddleware;
    const app = (this.app = new Koa());
    const httpServer = createServer(app.callback());
    const router = new Router();

    if (this.config.upload.enabled) {
      multerMiddleware = multer({
        ...this.config.upload.multer,
      });
    }

    if (this.config.static.enabled) {
      app.use(
        serve(path.join(this.config.projectDir, this.config.static.dirName))
      );
    }

    app.use(cors());
    app.use(bodyParser());

    app.use(async (ctx, next) => {
      try {
        await next();
      } catch (e) {
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
          __: (...args) => this.microI18n.__(reqBody.locale, ...args),
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
