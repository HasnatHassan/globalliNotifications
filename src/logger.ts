export interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

function format(level: string, message: string, context?: Record<string, unknown>): string {
  const ctx = context && Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : "";
  return `[${new Date().toISOString()}] ${level.padEnd(5)} ${message}${ctx}`;
}

export const consoleLogger: Logger = {
  info: (m, c) => console.log(format("INFO", m, c)),
  warn: (m, c) => console.warn(format("WARN", m, c)),
  error: (m, c) => console.error(format("ERROR", m, c)),
};

export const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};
