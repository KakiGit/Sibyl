import { startServer } from "../server.js";
import { getServerBindConfig } from "@sibyl/shared";

const bindConfig = getServerBindConfig();

startServer({
  port: bindConfig.port,
  host: bindConfig.addr,
}).catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});