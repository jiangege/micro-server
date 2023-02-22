const path = require("path");
const Koa = require("koa");
const Router = require("koa-router");
const bodyParser = require("koa-bodyparser");
const cors = require("@koa/cors");
const multer = require("@koa/multer");
const serve = require("koa-static");
const SocketIO = require("socket.io");
const _ = require("lodash");
const Joi = require("joi");

const MicroModule = require("./module");
const MicroConfigLoader = require("./config");

class MicroServer {
  #httpServer = null;
  constructor() {
    this.microModule = new MicroModule(this);
    this.microConfig = new MicroConfigLoader();

    this.defaultConfig = {
      port: 8080,
      projectDir: process.cwd(),
      configDir: "./config",
      servicesDir: "./services",
      allowHeaders: ["token", "accessKey", "signature"],
      upload: {
        enabled: true,
      },
      static: {
        enabled: true,
        dirName: "client",
      },
      sio: {
        enabled: true,
        filePath: "./socket.io",
      },
      restriction: {
        token: null,
      },
    };

    this.app = null;
  }
  #loadModules() {
    this.microModule.load(
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

    if (ctx.request.files) {
      reqData._files = ctx.request.files;
    }

    reqHeader = {
      ...reqHeader,
      ..._.pick(ctx.request.body, this.config.allowHeaders),
    };
    return {
      ...reqHeader,
      data: reqData,
    };
  }
  /**
   * The configuration to use, overriding any defaults or previously set values. If not provided, the default configuration will be used.
   * @typedef {Object} ServerConfig
   * @property {number} [port] - The port number to listen on. Default value is `8080`.
   * @property {string} [projectDir] - The root directory of the project. If not provided, the default value from the `defaultConfig` property will be used.
   * @property {string} [configDir] - The directory containing the configuration files. If not provided, the default value from the `defaultConfig` property will be used.
   * @property {string} [env] - The environment to run the server in. If not provided, the value of the `SERVER_ENV` environment variable or the default value from the `defaultConfig` property will be used.
   * @property {string[]} [allowHeaders] - An array of headers to allow for cross-origin requests. Default value is `["token", "accessKey", "signature"]`.
   * @property {Object} [upload] - An object with properties for configuring file uploads. Default value is `{ enabled: true }`.
   * @property {boolean} [upload.enabled] - Whether file uploads are enabled. Default value is `true`.
   * @property {Object} [static] - An object with properties for configuring serving static files. Default value is `{ enabled: true, dirName: "client" }`.
   * @property {boolean} [static.enabled] - Whether serving static files is enabled. Default value is `true`.
   * @property {string} [static.dirName] - The name of the directory containing the static files. Default value is `"client"`.
   * @property {Object} [sio] - An object with properties for configuring Socket.IO. Default value is `{ enabled: true, filePath: "./socket.io" }`.
   * @property {boolean} [sio.enabled] - Whether Socket.IO is enabled. Default value is `true`.
   * @property {string} [sio.filePath] - The file path for the Socket.IO server. Default value is `"./socket.io"`.
   * @property {Object} [restriction] - An object with properties for configuring access restrictions. Default value is `{ token: null }`.
   * @property {string} [restriction.token] - The access token required for making API requests. Default value is `null`.
   */

  /**
   * Loads the configuration from the provided or default configuration files.
   * @param {ServerConfig} [config={}] - The configuration to use, overriding any defaults or previously set values. If not provided, the default configuration will be used.
   * @returns {ServerConfig} The merged configuration, after loading and merging with the default configuration and any provided values.
   */

  loadConfig(config = {}) {
    const projectDir = config.projectDir ?? this.defaultConfig.projectDir;
    require("dotenv").config({
      path: projectDir,
    });
    const configDir = config.configDir ?? this.defaultConfig.configDir;
    const loadedConfig = this.microConfig.load(projectDir, configDir, {
      env: config.env ?? process.env.SERVER_ENV,
      projectDir,
      configDir,
    });

    return (this.config = _.merge({}, this.defaultConfig, loadedConfig));
  }

  /**
   * Starts the server with the current configuration by loading the modules, starting the HTTP server, and (optionally) starting the Socket.IO server.
   * @async
   * @returns {Promise<void>} A promise that resolves when the server has started.
   */

  start() {
    this.#loadModules();
    this.#startHttpServer();
    if (this.config.sio.enabled) {
      this.#startSocketIO();
    }
  }

  async #verifyCallRequest(service, logic, func) {
    if (
      ![service, logic, func].every((name) =>
        /^[a-zA-Z0-9]\w{0,49}$/.test(name)
      )
    ) {
      throw new Error("Invalid request");
    }
  }

  async #callFunc(service, logic, func, reqBody) {
    const funcInfo = await this.microModule.getFunc(service, logic, func, {
      ...reqBody,
      from: "api",
    });

    if (!funcInfo) {
      throw new Error("Cannot found this function");
    }

    if (
      this.config.restriction.token != null &&
      [
        funcInfo.modifier,
        funcInfo.service.modifier,
        funcInfo.logic.modifier,
      ].some((d) => d === "$")
    ) {
      if (this.config.restriction.token !== reqBody.token) {
        throw new Error("Invalid token");
      }
    }

    const result = await funcInfo.fn({
      ...reqBody,
      from: "api",
    });

    return result;
  }

  #startHttpServer() {
    let multerMiddleware;
    const app = (this.app = new Koa());
    const httpServer = require("http").createServer(app.callback());
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
        console.error(e.message, e.stack);
        if (e instanceof Joi.ValidationError) {
          ctx.body = {
            success: false,
            data: {
              code: 400,
              message: "Bad request",
              details: e.details,
            },
          };
        }
        ctx.body = {
          success: false,
          data: {
            code: e.code ?? 500,
            message: e.message,
            ...(e.details ? { details: e.details } : {}),
          },
        };
      }
    });

    router.all(
      "/:service/:logic/:func",
      async (ctx, next) => {
        if (this.config.upload.enabled) {
          return multerMiddleware.array("files")(ctx, next);
        }
        return next();
      },
      async (ctx) => {
        const { service, logic, func } = ctx.params;

        await this.#verifyCallRequest(service, logic, func);
        const reqBody = this.#getReqBody(ctx);

        const result = await this.#callFunc(service, logic, func, {
          ...reqBody,
          from: "api",
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

  #startSocketIO() {
    const io = SocketIO(this.#httpServer);

    try {
      require(path.join(this.config.projectDir, this.config.sio.filePath))(io);
    } catch (e) {}

    io.on("connection", (socket) => {
      socket.on("call", async (data, callback) => {
        try {
          const reqBody = {
            token: data?.token ?? null,
            accessKey: data?.accessKey ?? null,
            signature: data?.signature ?? null,
            data: data?.data ?? {},
          };

          const [service, logic, func] = data.path.split("/");

          await this.#verifyCallRequest(service, logic, func);

          const result = await this.#callFunc(service, logic, func, {
            ...reqBody,
            from: "socketio",
          });

          if (typeof result === "function") {
            return result(socket);
          }

          // eslint-disable-next-line node/no-callback-literal
          callback?.({
            success: true,
            data: {
              ...result,
            },
          });
        } catch (e) {
          // eslint-disable-next-line node/no-callback-literal
          callback?.({
            success: false,
            data: {
              message: e.message,
            },
          });
        }
      });
    });
  }
}

module.exports = MicroServer;
