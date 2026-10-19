import { consoleLogger } from "../logger.js";
import { startServer, type RunningServer } from "./createServer.js";

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 0 || port > 65_535) {
  consoleLogger.error(`Invalid PORT "${process.env.PORT}"`);
  process.exit(1);
}

let running: RunningServer;
try {
  running = await startServer({ port, logger: consoleLogger, activityFeed: process.env.ACTIVITY_FEED !== "off" });
} catch (err) {
  const code = (err as NodeJS.ErrnoException).code;
  consoleLogger.error(
    code === "EADDRINUSE"
      ? `Port ${port} is already in use. Stop the other process or start with PORT=<free port>.`
      : `Failed to start: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
}
consoleLogger.info(`Notification demo running at http://localhost:${running.port}`);

const shutdown = () => {
  consoleLogger.info("Shutting down");
  running.close().finally(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
