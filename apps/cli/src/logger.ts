type Level = "INFO" | "WARN" | "ERROR" | "DEBUG";

function format(level: Level, msg: string): string {
  return `[${new Date().toISOString()}] [${level}]  ${msg}`;
}

export const log = {
  info(msg: string) {
    console.log(format("INFO", msg));
  },
  warn(msg: string) {
    console.warn(format("WARN", msg));
  },
  error(msg: string) {
    console.error(format("ERROR", msg));
  },
  debug(msg: string, enabled: boolean) {
    if (enabled) {
      console.log(format("DEBUG", msg));
    }
  },
};
