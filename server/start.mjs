import { buildApp } from "./app.mjs";
const port = Number(process.env.PORT || 3001);
const app = await buildApp({
  dbPath: process.env.IPL_DB || "data/database.sqlite",
  origins: process.env.IPL_ORIGINS?.split(","),
  serveStatic: true,
});
await app.listen({ host: process.env.IPL_HOST || "127.0.0.1", port });
console.log(
  `D&D IPL: http://127.0.0.1:${port} · SQLite · без открытой регистрации`,
);
for (const sig of ["SIGINT", "SIGTERM"])
  process.on(sig, async () => {
    await app.close();
    process.exit(0);
  });
