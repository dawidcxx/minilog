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
