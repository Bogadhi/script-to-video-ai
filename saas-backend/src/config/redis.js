const IORedis = require("ioredis");

const connection = new IORedis({
  host: "127.0.0.1",
  port: process.env.REDIS_PORT || 6380,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

connection.on("connect", () => {
  console.log(`✅ Redis connected on port ${process.env.REDIS_PORT || 6380}`);
});

connection.on("error", (err) => {
  console.error("❌ Redis error:", err.message);
});

module.exports = connection;
