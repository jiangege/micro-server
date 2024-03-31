# MicroServer

极致简单的api server 框架，该框架意在快速启动 api 开发。

### 安装

```javascript
npm install @jiangege47/micro-server
```

## 快速介绍

### 自动路径映射
项目基于文件路径自动映射 api 接口，例如文件位置 `/services/test/index.js` 中有一个 **hello()** 函数。
```javascript
async function hello() {
  return "Hello world"
}
module.exports = {
  hello
}
```
hello 函数将自动映射 api 路径: `/api/test/index/hello` 。函数的返回值就是调用接口得到的返回结果。


 ### GET & POST 通用
每个函数同时支持 get 和 post 请求。它们的请求体内容都将映射到函数的第一个参数位置里。
```javascript
const hello = (req) => {
  console.log(req.data.name) // Tom
}
```
你可以通过`req.data`获取到请求体的内容(请求体内容解析基于 `koa-parser` 框架，默认支持 `form`、`json` 和 `text` 等格式)。实际请求时，请求内容格式参考以下:
```json
{
  "token": null,
   "data": {
      "name": "Tom"
    }
}
```

### token 限制
使用 `$` 开头的函数，将比较 req.token 与 config 中 `restriction.token` 的一致性。 
```javascript
const $hello = (req) => {
  console.log('test')
}
```

标识了 `$` 开头的函数意味着必须在请求时传递一个**token**字段:
```
{
  "token": "sbxxxxxxxx",
   "data": {}
}
```
# TODO
