// Isolated UI fixture. In-memory data only; never imports or changes the real database.
import { buildApp } from "../server/app.mjs";
import { randomUUID } from "node:crypto";
const origin = "http://127.0.0.1:3002";
const app = await buildApp({
  dbPath: ":memory:",
  origins: [origin],
  serveStatic: true,
});
const request = (url, payload, cookie) =>
  app.inject({
    url,
    method: payload === undefined ? "GET" : "POST",
    headers: { origin, "x-ipl-request": "1", ...(cookie ? { cookie } : {}) },
    payload,
  });
const dm = (
  await request("/api/setup", {
    login: "preview-master",
    name: "Мастер · тест",
    password: "Preview-only-2026!",
  })
).headers["set-cookie"].split(";")[0];
const campaign = (
  await request(
    "/api/campaigns",
    {
      name: "Хроники Туманного побережья",
      description:
        "Старый маяк погас три ночи назад. Корабли пропадают в тумане, а море возвращает на берег забытые истории. Отдельная тестовая кампания.",
    },
    dm,
  )
).json().id;
const invitation = (
  await request(`/api/campaigns/${campaign}/invites`, {}, dm)
).json().invitation;
const player = (
  await request("/api/auth/register", {
    login: "preview-player",
    name: "Аня · тест",
    password: "Preview-only-2026!",
    invitation,
  })
).headers["set-cookie"].split(";")[0];
const id = randomUUID();
await request(
  `/api/campaigns/${campaign}/action`,
  {
    operationId: randomUUID(),
    type: "draft",
    data: {
      id,
      name: "Ариа Ветролист",
      species: "Эльф",
      cls: "Следопыт",
      background: "Страж",
      bio: "В поисках пропавшей экспедиции.",
      stats: [15, 14, 13, 12, 10, 8],
      status: "submitted",
    },
  },
  player,
);
await request(
  `/api/campaigns/${campaign}/action`,
  {
    operationId: randomUUID(),
    type: "character",
    id,
    version: 0,
    data: {
      status: "approved",
      items: [
        {
          id: randomUUID(),
          name: "Длинный меч",
          type: "Оружие",
          description: "Надёжный клинок для долгого путешествия.",
          tags: ["str"],
          revealed: true,
        },
        {
          id: randomUUID(),
          name: "Компас приливов",
          type: "Чудесный предмет",
          description: "Его стрелка указывает в сторону моря.",
          secret: "Скрытая башня",
          revealed: false,
        },
      ],
    },
  },
  dm,
);
await app.listen({ port: 3002, host: "127.0.0.1" });
console.log("Isolated UI fixture http://127.0.0.1:3002");
for (const sig of ["SIGINT", "SIGTERM"])
  process.on(sig, async () => {
    await app.close();
    process.exit(0);
  });
