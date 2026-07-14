import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info(`🚀 fitpk-server listening on :${env.PORT} [${env.NODE_ENV}]`);
});

// 优雅退出：等已有请求处理完
function shutdown(signal: string) {
  logger.warn({ signal }, 'shutting down...');
  server.close((err) => {
    if (err) {
      logger.error({ err }, 'error during shutdown');
      process.exit(1);
    }
    process.exit(0);
  });
  // 兜底：10s 强杀
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// 未捕获异常：记录并退出（交给 PM2 / K8s 拉起）
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandledRejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaughtException');
  process.exit(1);
});
