import { promises as fsp } from "fs";
import _ from "lodash";
import path from "path";
import { pathToFileURL } from "url";

class MicroModule {
  constructor(microServer) {
    this.microServer = microServer;
    this.funcCache = new Map();
  }

  parseModifier(text) {
    const results = /^(\$)?(\w{0,49})$/.exec(text);
    let info = {};
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

  async parseInfo(rootPath, depth = 3, index = 0) {
    let thisInfo = {};

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
          const funcList = await import(pathToFileURL(rootPath));
          for (const funcName in funcList) {
            const parsedResult = this.parseModifier(funcName);
            if (parsedResult) {
              console.log(`loaded ${rootPath}#${funcName}`);
              thisInfo.exports[parsedResult.name] = {
                name: parsedResult.name,
                modifier: parsedResult.modifier,
                fn: funcList[funcName],
              };
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

  async load(serviceDirPath) {
    this.serviceInfo = await this.parseInfo(serviceDirPath);
    this.#buildFunctionCache();
    return this.serviceInfo;
  }

  #buildFunctionCache() {
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

  async getFunc(service, logic, func) {
    const key = `${service}:${logic}:${func}`;
    return this.funcCache.get(key) || null;
  }
}

export default MicroModule;
