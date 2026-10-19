import { consoleLogger } from "../logger.js";
import { startServer } from "./createServer.js";

const port = Number(process.env.PORT ?? 3000);
const running = await startServer(port, consoleLogger);
consoleLogger.info(`Notification demo running at http://localhost:${running.port}`);

const shutdown = () => {
  consoleLogger.info("Shutting down");
  running.close().finally(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
