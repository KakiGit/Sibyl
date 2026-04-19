import { startServer } from "../server.js";

startServer({
  port: parseInt(process.env.PORT || "3000"),
  host: process.env.HOST || "localhost",
}).catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});