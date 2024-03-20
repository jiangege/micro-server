const fs = require("fs");
const fsp = require("fs/promises");
const _ = require("lodash");
const path = require("path");

class MicroModule {
  constructor(microServer) {
    this.microServer = microServer;
    this.cache = {};
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
          const funcList = require(rootPath);
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
    return this.serviceInfo;
  }

  async getFunc(service, logic, func) {
    // if (
    //   ![service, logic, func].every((name) =>
    //     /^[a-zA-Z0-9]\w{0,49}$/.test(name)
    //   )
    // ) {
    //   throw new Error("Invalid func");
    // }

    let funcInfo = null;

    this.serviceInfo?.children?.find((serviceInfo) => {
      if (serviceInfo.name === service) {
        return serviceInfo.children.find((logicInfo) => {
          if (logicInfo.name === logic) {
            funcInfo = {
              ...logicInfo.exports[func],
              service: serviceInfo,
              logic: logicInfo,
            };
          }
        });
      }
    });

    return funcInfo;
  }
}

module.exports = MicroModule;
