// Extend Koa context for multer
import { Context } from "koa";
import { ParameterizedContext } from "koa";
import { IRouterParamContext } from "koa-router";

declare module "koa" {
  interface Request {
    files?: any;
    file?: any;
  }
}

declare module "@koa/multer" {
  const multer: any;
  export default multer;
}
