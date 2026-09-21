export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T = any>(url: string, body?: unknown): Promise<T> {
  const response = await fetch("/api" + url, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined
        ? {}
        : { "Content-Type": "application/json", "X-IPL-Request": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(
      response.status,
      data.error || "Не удалось выполнить запрос",
    );
  return data;
}
export type User = { id: string; name: string; login: string; admin: boolean };
