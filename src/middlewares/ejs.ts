import Koa from "koa";
import path from "path";
import views from "koa-views";

export interface EjsMiddlewareConfig {
  enabled: boolean;
  clientDir: string;
  ejsOptions?: {
    enabled: boolean;
  };
}

export function createEjsMiddleware(
  config: EjsMiddlewareConfig
): Koa.Middleware[] {
  const middlewares: Koa.Middleware[] = [];

  if (!config.enabled || !config.ejsOptions?.enabled) {
    return middlewares;
  }

  // Setup EJS templating support
  middlewares.push(
    views(config.clientDir, {
      extension: "ejs",
    })
  );

  // Add a middleware to render EJS templates
  middlewares.push(async (ctx, next) => {
    if (ctx.method === "GET") {
      try {
        let viewPath = ctx.path;

        // Handle root path
        if (viewPath === "/") {
          viewPath = "index";
        } else {
          // Remove leading slash
          if (viewPath.startsWith("/")) {
            viewPath = viewPath.substring(1);
          }

          // Remove trailing slash if exists
          if (viewPath.endsWith("/")) {
            viewPath = viewPath.substring(0, viewPath.length - 1);
          }

          // Security: Prevent path traversal attacks
          if (viewPath.includes("..") || viewPath.includes("\\")) {
            await next();
            return;
          }

          // Normalize path to prevent directory traversal
          viewPath = path.normalize(viewPath).replace(/\\/g, "/");
        }

        // Try to render the view
        await ctx.render(viewPath);
        return;
      } catch (err) {
        await next();
      }
    } else {
      await next();
    }
  });

  return middlewares;
}
