function formatMessage(level, message, meta) {
  const timestamp = new Date().toISOString();
  const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
  return `[${timestamp}] [${level}] ${message}${suffix}`;
}

function log(level, message, meta) {
  const line = formatMessage(level, message, meta);
  if (level === "ERROR") {
    console.error(line);
    return;
  }

  console.log(line);
}

module.exports = {
  info(message, meta) {
    log("INFO", message, meta);
  },
  warn(message, meta) {
    log("WARN", message, meta);
  },
  error(message, meta) {
    log("ERROR", message, meta);
  }
};
