import type {
  BootState,
  CreatedUserInvitation,
  InvitationDetails,
  LogsFilterValues,
  ManagedUser,
  NotificationAlert,
  NotificationTransport,
  ServiceLog,
  User,
} from "../types";

type ApiError = { error?: string };

type LogsQuery = {
  service?: string;
  level?: string;
  request_id?: string;
  resource_id?: string;
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
  if (query.request_id) params.set("request_id", query.request_id);
  if (query.resource_id) params.set("resource_id", query.resource_id);
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

  async getLogsFilterValues(): Promise<LogsFilterValues> {
    return request<LogsFilterValues>("/api/logs/filter-values");
  },

  async getUsers(): Promise<ManagedUser[]> {
    const response = await request<{ users: ManagedUser[] }>("/api/users");
    return response.users;
  },

  async inviteUser(email: string): Promise<CreatedUserInvitation> {
    return request<CreatedUserInvitation>("/api/users/invite", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  async getInvitation(invitationID: string): Promise<InvitationDetails> {
    const response = await request<{ invitation: InvitationDetails }>(`/api/invitations/${invitationID}`);
    return response.invitation;
  },

  async completeInvitation(invitationID: string, password: string): Promise<User> {
    const response = await request<{ user: User }>(`/api/invitations/${invitationID}/complete`, {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    return response.user;
  },

  async getNotificationTransports(): Promise<NotificationTransport[]> {
    const response = await request<{ transports: NotificationTransport[] }>("/api/notifications/transports");
    return response.transports;
  },

  async createNotificationTransport(payload: {
    name: string;
    destination_type: "direct_message" | "guild_text_channel";
    destination_label?: string;
    dm_user_id?: string;
    guild_id?: string;
    channel_id?: string;
    bot_token: string;
    enabled: boolean;
  }): Promise<NotificationTransport[]> {
    const response = await request<{ transports: NotificationTransport[] }>("/api/notifications/transports", {
      method: "POST",
      body: JSON.stringify({
        provider: "discord_assistant",
        ...payload,
      }),
    });
    return response.transports;
  },

  async updateNotificationTransport(
    transportID: number,
    payload: {
      name: string;
      destination_type: "direct_message" | "guild_text_channel";
      destination_label?: string;
      dm_user_id?: string;
      guild_id?: string;
      channel_id?: string;
      bot_token?: string;
      enabled: boolean;
    },
  ): Promise<NotificationTransport[]> {
    const response = await request<{ transports: NotificationTransport[] }>(`/api/notifications/transports/${transportID}`, {
      method: "PUT",
      body: JSON.stringify({
        provider: "discord_assistant",
        ...payload,
      }),
    });
    return response.transports;
  },

  async getNotificationAlerts(): Promise<NotificationAlert[]> {
    const response = await request<{ alerts: NotificationAlert[] }>("/api/notifications/alerts");
    return response.alerts;
  },

  async createNotificationAlert(payload: {
    name: string;
    transport_id: number;
    match_query: string;
    message: string;
    enabled: boolean;
  }): Promise<NotificationAlert[]> {
    const response = await request<{ alerts: NotificationAlert[] }>("/api/notifications/alerts", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return response.alerts;
  },

  async updateNotificationAlert(
    alertID: number,
    payload: {
      name: string;
      transport_id: number;
      match_query: string;
      message: string;
      enabled: boolean;
    },
  ): Promise<NotificationAlert[]> {
    const response = await request<{ alerts: NotificationAlert[] }>(`/api/notifications/alerts/${alertID}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    return response.alerts;
  },
};
