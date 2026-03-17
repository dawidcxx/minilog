export type BootState = {
  has_user: boolean;
};

export type User = {
  id: number;
  email: string;
};

export type ServiceLog = {
  timestamp: string;
  hostname: string;
  service: string;
  level: string;
  request_id?: string | null;
  resource_id?: string | null;
  message?: string | null;
  message_json?: unknown;
};

export type LogsFilterValues = {
  service: string[];
  level: string[];
};
