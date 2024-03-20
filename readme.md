# MicroServer

MicroServer is a lightweight web server designed to provide an easy-to-use and modular way to build web services. It is written in JavaScript and uses the Koa framework.

## Installation

```javascript
npm install @jiangege47/micro-server
```

## Usage

Here is an example of how to use MicroServer:

```javascript
const MicroServer = require("@jiangege47/micro-server");

const server = new MicroServer();
server.loadConfig();
server.start();
```

## Call func

```javascript
await server.call("test", "abc", "hello");
```

## Loading Mechanism

The MicroServer module has a specific loading mechanism for your service logic files. Here's a quick guide to help you understand how it works and where to place your service files.

### Default File Structure

The default file structure for a MicroServer service is as follows:

```
root/
  |- service/
  |  |- logic/
  |  |  |- service-logic.js
  |- micro-server.js
```

### Service Files

Your service logic files should be placed in the `logic/` folder under `service/`. Each service should have its own folder under `logic/` containing one or more JavaScript files. These files should contain the logic for each service's individual functionality.

### Naming Convention

The naming convention for service logic files is important. Each file should be named after the service it belongs to, followed by a hyphen and the logic it provides. For example: `service-logic.js`.
