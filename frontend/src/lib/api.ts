import type { BootState, ServiceLog, User } from "../types";

type ApiError = { error?: string };

type LogsQuery = {
  service?: string;
  level?: string;
  q?: string;
  limit?: number;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    let message = `request failed (${response.status})`;
    try {
      const payload = (await response.json()) as ApiError;
      if (payload.error) message = payload.error;
    } catch {
      // no-op
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

function toQueryString(query: LogsQuery): string {
  const params = new URLSearchParams();
  if (query.service) params.set("service", query.service);
  if (query.level) params.set("level", query.level);
  if (query.q) params.set("q", query.q);
  if (query.limit) params.set("limit", String(query.limit));
  return params.toString();
}

export const api = {
  async bootstrap(): Promise<BootState> {
    return request<BootState>("/api/bootstrap");
  },

  async register(email: string, password: string): Promise<User> {
    const response = await request<{ user: User }>("/api/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    return response.user;
  },

  async login(email: string, password: string): Promise<User> {
    const response = await request<{ user: User }>("/api/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    return response.user;
  },

  async logout(): Promise<void> {
    await request<{ status: string }>("/api/logout", { method: "POST" });
  },

  async me(): Promise<User> {
    const response = await request<{ user: User }>("/api/me");
    return response.user;
  },

  async getLogs(query: LogsQuery): Promise<ServiceLog[]> {
    const qs = toQueryString(query);
    const path = qs ? `/api/logs?${qs}` : "/api/logs";
    const response = await request<{ logs: ServiceLog[] }>(path);
    return response.logs;
  },
};
