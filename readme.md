# micro-server

A lightweight microservice framework based on Koa.js, supporting modularization, internationalization, and flexible service invocation patterns.

## Features

- Lightweight service framework built on Koa.js
- Modular structure with three-layer architecture (service/logic/function)
- Built-in file upload functionality
- Static file service support
- Internationalization support (i18n)
- Built-in client SDK
- Environment configuration management (.env support)
- API permission control
- Internal/External function isolation mechanism

## Installation

```bash
npm install @jiangege47/micro-server
```

## Server-side Usage

### Creating a Basic Server

```javascript
import { MicroServer } from "@jiangege47/micro-server";

// Create a server instance
const server = new MicroServer();

// Load configuration and start the server
async function startServer() {
  // Load configuration
  await server.loadConfig({
    port: 3000, // Optional, default is 8080
    projectDir: process.cwd(), // Optional, default is current working directory
    configDir: "./config", // Optional, default is './config'
    servicesDir: "./services", // Optional, default is './services'
  });

  // Start the server
  await server.start();
}

startServer().catch((err) => console.error(err));
```

### Directory Structure

Recommended project directory structure:

```
my-project/
├── config/           # Configuration files
│   └── default.json  # Default configuration
├── services/         # Business service modules
│   ├── user/         # User service module
│   │   ├── account.js  # Account logic
│   │   └── profile.js  # Profile logic
│   └── _internal/    # Internal services (prefix _ indicates internal use only)
│       └── helper.js   # Internal helper functions
├── locales/          # Internationalization texts
│   ├── en-US.json    # English
│   └── zh-CN.json    # Chinese
├── client/           # Static resource files
├── .env              # Environment variables
└── index.js          # Entry file
```

### Service Module Development

Services follow a three-layer structure: `service/logic/function`. For example, the API access path `/api/user/account/login` corresponds to:

- `user` service
- `account` logic
- `login` function

Example of creating a service module (`services/user/account.js`):

```javascript
// Public function - accessible via API
export function login(params) {
  const { username, password } = params.data;

  // Authentication logic
  return {
    userId: 123,
    username: username,
    token: "example-token",
  };
}

// Internal function - only callable within the server
export function _validatePassword(params) {
  const { password, hash } = params.data;
  // Password validation logic
  return true;
}
```

### Configuration File

Configuration file example (`config/config.default.js`):

```javascript
export default (config) => ({
  port: 8080,
  allowHeaders: ["serviceApiKey", "accessKey", "signature", "locale"],
  upload: {
    enabled: true,
    allowedPaths: [/^\/api\/user\/profile\/upload$/],
    multer: {
      dest: "uploads/",
    },
  },
  static: {
    enabled: true,
    dirName: "client",
  },
  restriction: {
    serviceApiKey: "your-api-key-here",
  },
  locales: {
    defaultLocale: "en-US",
  },
});
```

Environment-specific configuration (`config/config.production.js`):

```javascript
export default (config) => ({
  port: 80,
  restriction: {
    serviceApiKey: "production-api-key",
  },
});
```

### Internationalization Support

Example of creating a language file (`locales/en-US.json`):

```json
{
  "sys.bad_request": "Bad request",
  "sys.internal_server_error": "Internal server error",
  "user.login_failed": "Invalid username or password"
}
```

Using translations in services:

```javascript
export function login(params) {
  const { username, password } = params.data;
  const { __ } = params; // Get translation function

  // Return localized error message on validation failure
  if (!isValidCredentials(username, password)) {
    throw new Error(__("user.login_failed"));
  }

  return {
    /* Success response */
  };
}
```

### Internal Service Calls

Calling other services from within the server:

```javascript
// Call another service function from a service function
export async function register(params) {
  const { username, password, email } = params.data;
  const server = params.server;

  // Internal call to validateEmail function in _internal/helper.js
  const isEmailValid = await server.call(
    "_internal",
    "helper",
    "validateEmail",
    {
      data: { email },
    }
  );

  if (!isEmailValid) {
    throw new Error("Invalid email address");
  }

  // Handle registration logic
  return {
    /* Registration success response */
  };
}
```

### File Upload Handling

Example of a service function handling file uploads:

```javascript
export function upload(params) {
  const { _files } = params.data;

  if (!_files || _files.length === 0) {
    throw new Error("No files uploaded");
  }

  // Process uploaded files
  return {
    files: _files.map((file) => ({
      filename: file.filename,
      size: file.size,
      path: file.path,
    })),
  };
}
```

## Client-side Usage

### Browser Environment

```javascript
import { MicroClient } from "@jiangege47/micro-server";

// Create client instance
const client = new MicroClient({
  baseURL: "http://localhost:8080", // Server address
  timeout: 30000, // Timeout (milliseconds)
  locale: "en-US", // Language setting
  serviceApiKey: "your-api-key", // Required for accessing restricted services
  headers: {
    // Custom request headers
    "Custom-Header": "value",
  },
});

// Call regular API
async function login() {
  const result = await client.call("user/account/login", {
    username: "testuser",
    password: "password123",
  });

  if (result.success) {
    console.log("Login successful:", result.data);
  } else {
    console.error("Login failed:", result.data.message);
  }
}

// Upload file
async function uploadProfilePicture(fileInput) {
  const file = fileInput.files[0];
  const result = await client.uploadFile("user/profile/upload", file, {
    userId: 123,
    description: "Profile picture",
  });

  if (result.success) {
    console.log("Upload successful:", result.data);
  } else {
    console.error("Upload failed:", result.data.message);
  }
}
```

### Setting Language

```javascript
// Set client language
client.setLocale("en-US");

// Chain call
const result = await client.setLocale("en-US").call("user/account/login", {
  username: "testuser",
  password: "password123",
});
```

### Token Management

```javascript
// Set token (stored in localStorage by default)
client.setToken("your-token-here");

// Get current token
const token = client.getToken();
```

## Advanced Features

### Service Permission Control

Use the `$` modifier to restrict function access:

```javascript
// Add $ before the function name to indicate it requires serviceApiKey validation
export function $adminOperation(params) {
  // Only accessible with the correct serviceApiKey
  // ...perform admin operations
}
```

### Custom Response

Return a function to control Koa response:

```javascript
export function downloadFile(params) {
  const { filename } = params.data;

  // Return a function to customize Koa response
  return async (ctx) => {
    ctx.set("Content-Disposition", `attachment; filename=${filename}`);
    ctx.set("Content-Type", "application/octet-stream");
    ctx.body = fs.createReadStream(`./files/${filename}`);
  };
}
```

## Deployment

### Production Environment Configuration

Create a production environment configuration file (`config/config.production.js`):

```javascript
export default (config) => ({
  port: 80,
  restriction: {
    serviceApiKey: "production-api-key",
  },
});
```

Create a `.env` file:

```
SERVER_ENV=production
DATABASE_URL=mongodb://user:pass@host:port/dbname
```

### Starting the Server

```javascript
// Specify environment
await server.loadConfig({
  env: "production",
});
```

## License

MIT
