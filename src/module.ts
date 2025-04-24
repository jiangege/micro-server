import { promises as fsp } from "fs";
import _ from "lodash";
import path from "path";
import { pathToFileURL } from "url";

import type MicroServer from "./server.js";

interface ModuleInfo {
  name: string;
  modifier?: string;
  children?: ModuleInfo[];
  exports?: Record<string, FunctionInfo>;
}

interface FunctionInfo {
  name: string;
  modifier?: string;
  fn: (...args: any[]) => any;
  service?: ModuleInfo;
  logic?: ModuleInfo;
}

class MicroModule {
  microServer: MicroServer;
  funcCache: Map<string, FunctionInfo>;
  serviceInfo: ModuleInfo | null;

  constructor(microServer: MicroServer) {
    this.microServer = microServer;
    this.funcCache = new Map();
    this.serviceInfo = null;
  }

  parseModifier(text: string): { name: string; modifier?: string } | null {
    const results = /^(\$)?(\w{0,49})$/.exec(text);
    let info: { name: string; modifier?: string } | null = { name: "" };
    if (results?.length === 2) {
      info.name = results[1];
    } else if (results?.length === 3) {
      info.modifier = results[1];
      info.name = results[2];
    } else {
      info = null;
    }
    return info;
  }

  async parseInfo(
    rootPath: string,
    depth = 3,
    index = 0
  ): Promise<ModuleInfo | null> {
    let thisInfo: ModuleInfo | null = { name: "" };

    try {
      const fsStat = await fsp.stat(rootPath);

      if (index < depth - 1 && fsStat.isDirectory()) {
        thisInfo.name = path.basename(rootPath);

        thisInfo.children = [];
        const childDirList = await fsp.readdir(rootPath);

        for (const childDir of childDirList) {
          const childDirPath = path.join(rootPath, childDir);
          const childInfo = await this.parseInfo(
            childDirPath,
            depth,
            index + 1
          );
          if (childInfo) {
            thisInfo.children.push(childInfo);
          }
        }
      } else if (index === depth - 1) {
        if (fsStat.isFile() && path.extname(rootPath) === ".js") {
          thisInfo.name = path.basename(rootPath, path.extname(rootPath));
          thisInfo.exports = {};
          const funcList = await import(pathToFileURL(rootPath).toString());
          for (const funcName in funcList) {
            const parsedResult = this.parseModifier(funcName);
            if (parsedResult) {
              console.log(`loaded ${rootPath}#${funcName}`);
              if (thisInfo && thisInfo.exports) {
                thisInfo.exports[parsedResult.name] = {
                  name: parsedResult.name,
                  modifier: parsedResult.modifier,
                  fn: funcList[funcName],
                };
              }
            } else {
              thisInfo = null;
            }
          }
        } else {
          thisInfo = null;
        }
      } else {
        thisInfo = null;
      }

      if (thisInfo) {
        const parsedResult = this.parseModifier(thisInfo.name);
        if (parsedResult) {
          thisInfo.modifier = parsedResult.modifier;
          thisInfo.name = parsedResult.name;
          // if (thisInfo.modifier === "_") {
          //   thisInfo = null;
          // }
        } else {
          thisInfo = null;
        }
      }
    } catch (e) {
      thisInfo = null;
      console.error("Load error", e);
    }

    return thisInfo;
  }

  async load(serviceDirPath: string): Promise<ModuleInfo | null> {
    this.serviceInfo = await this.parseInfo(serviceDirPath);
    this.#buildFunctionCache();
    return this.serviceInfo;
  }

  #buildFunctionCache(): void {
    this.funcCache.clear();

    if (!this.serviceInfo?.children) return;

    for (const service of this.serviceInfo.children) {
      if (!service?.children) continue;

      for (const logic of service.children) {
        if (!logic?.exports) continue;

        for (const funcName in logic.exports) {
          const key = `${service.name}:${logic.name}:${funcName}`;
          this.funcCache.set(key, {
            ...logic.exports[funcName],
            service,
            logic,
          });
        }
      }
    }
  }

  async getFunc(
    service: string,
    logic: string,
    func: string,
    reqBody?: any
  ): Promise<FunctionInfo | null> {
    const key = `${service}:${logic}:${func}`;
    return this.funcCache.get(key) || null;
  }
}

export default MicroModule;
