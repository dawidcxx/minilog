export type BootState = {
  has_user: boolean;
};

export type User = {
  id: number;
  email: string;
  username: string;
  status: string;
  is_root: boolean;
};

export type ManagedUser = {
  id: number;
  email: string;
  username: string;
  status: string;
  created_at: string;
  is_root: boolean;
  invitation_id?: string;
  invitation_link?: string;
};

export type CreatedUserInvitation = {
  user: ManagedUser;
  invitation: {
    id: string;
    link: string;
  };
};

export type InvitationDetails = {
  invitation_id: string;
  email: string;
  username: string;
  status: string;
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

export type NotificationTransport = {
  id: number;
  name: string;
  provider: "discord_assistant";
  destination_type: "direct_message" | "guild_text_channel";
  destination_label?: string;
  dm_user_id?: string;
  guild_id?: string;
  channel_id?: string;
  enabled: boolean;
  has_bot_token: boolean;
  bot_token_masked?: string;
  created_at: string;
  updated_at: string;
};

export type NotificationAlert = {
  id: number;
  name: string;
  transport_id: number;
  transport_name: string;
  match_query: string;
  message: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};
