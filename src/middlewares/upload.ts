import fs from "fs";
import path from "path";
import Router from "koa-router";
import multer from "@koa/multer";

export interface UploadPathConfig {
  path: RegExp;
  allowedTypes: string[];
  maxFileSize: number; // in bytes
  maxFiles: number;
}

export interface UploadMiddlewareConfig {
  enabled: boolean;
  projectDir: string;
  paths: UploadPathConfig[];
  multerOptions?: any;
}

export async function createUploadMiddleware(
  config: UploadMiddlewareConfig
): Promise<Record<string, any>> {
  const multerMiddleware: Record<string, any> = {};

  if (!config.enabled) {
    return multerMiddleware;
  }

  // Create a unified upload directory
  const uploadDir = path.join(config.projectDir, "uploads");
  await fs.promises.mkdir(uploadDir, { recursive: true }).catch(() => {});

  // Create multer instances for each path configuration
  for (let index = 0; index < config.paths.length; index++) {
    const pathConfig = config.paths[index];

    multerMiddleware[index] = multer({
      storage: multer.diskStorage({
        destination: (_, __, cb) => cb(null, uploadDir),
        filename: (_, __, cb) => {
          // Generate unique filename with timestamp and random number
          const timestamp = Date.now();
          const random = Math.floor(Math.random() * 1000000);
          cb(null, `${timestamp}-${random}.dat`);
        },
      }),
      fileFilter: (_, file, cb) => {
        if (pathConfig.allowedTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error(`Unsupported file type: ${file.mimetype}`), false);
        }
      },
      limits: {
        fileSize: pathConfig.maxFileSize,
        files: pathConfig.maxFiles,
      },
      ...config.multerOptions,
    });
  }

  return multerMiddleware;
}

export function applyUploadMiddleware(
  router: Router,
  multerMiddleware: Record<string, any>,
  uploadPaths: UploadPathConfig[]
): void {
  router.use(async (ctx, next) => {
    if (uploadPaths.length === 0) {
      return next();
    }

    // Find upload configuration matching the current path
    const pathIndex = uploadPaths.findIndex((pathConfig) =>
      pathConfig.path.test(ctx.path)
    );

    if (pathIndex !== -1) {
      try {
        // Use the multer middleware for the matching path
        return multerMiddleware[pathIndex].array("files")(ctx, next);
      } catch (err: any) {
        ctx.status = 400;
        ctx.body = {
          success: false,
          data: {
            code: 400,
            message: err.message || "File upload failed",
          },
        };
        return;
      }
    }

    return next();
  });
}
