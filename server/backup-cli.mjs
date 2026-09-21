import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import {
  createBackup,
  inspectBackup,
  listBackups,
  restoreBackup,
} from "./backups.mjs";
const dbPath = process.env.IPL_DB || "data/database.sqlite";
const [command, file] = process.argv.slice(2);
try {
  if (command === "list")
    console.log(
      listBackups(dbPath)
        .map((b) => b.file)
        .join("\n") || "Копий пока нет",
    );
  else if (command === "check" && file) console.log(inspectBackup(file));
  else if (command === "restore" && file)
    console.log(
      "Восстановлено. Войдите в аккаунты заново.",
      restoreBackup(file, dbPath),
    );
  else if (command === "create") {
    if (!existsSync(dbPath)) throw new Error("Рабочая база не найдена");
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      console.log(createBackup(db, dbPath));
    } finally {
      db.close();
    }
  } else
    throw new Error(
      'Команды: pnpm backup create | list | check "путь" | restore "путь"',
    );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
