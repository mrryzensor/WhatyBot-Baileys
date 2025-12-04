export interface Contact {
  id: string;
  phone: string;
  name: string;
  [key: string]: string; // Allow dynamic variables
}

export interface Group {
  id: string;
  name: string;
  participants: number;
  image?: string;
}

export interface MessageLog {
  id: string;
  userId?: number | null; // User ID who sent the message
  target: string;
  status: 'pending' | 'sent' | 'failed';
  timestamp: Date;
  content: string;
  messageType?: string; // Type of message: 'single', 'bulk', 'group', 'auto-reply', 'media', etc.
}

export interface AppConfig {
  headless: boolean;
  messageDelay: number; // seconds (random between 1 and this value)
  maxContactsPerBatch: number; // Maximum contacts per batch
  waitTimeBetweenBatches: number; // Minutes to wait between batches
  chromePath?: string; // Optional Chrome executable path (legacy)
  defaultCountryCode?: string; // Default country code for single send (frontend only)
}

export interface AutoReplyRule {
  id: string;
  name: string;
  keywords: string[];
  response: string;
  matchType: 'exact' | 'contains';
  delay: number; // seconds to wait before replying
  isActive: boolean;
  mediaPath?: string; // Path to media file (optional)
  caption?: string; // Caption for media (optional)
}

// Schedule types
export type ScheduleType = 'now' | 'delay' | 'datetime';

export interface ScheduledMessage {
  id: string;
  type: 'single' | 'bulk' | 'groups';
  recipients?: string[]; // phone numbers or group IDs
  message: string;
  file?: File;
  scheduleType: ScheduleType;
  delayMinutes?: number;
  scheduledAt?: Date;
  status: 'pending' | 'scheduled' | 'sent' | 'failed' | 'cancelled';
  createdAt: Date;
  contactFile?: File;
  variables?: string[];
}

// Group selection save types
export interface GroupSelection {
  id: string;
  name: string;
  groupIds: string[];
  createdAt: Date;
  description?: string;
}

export enum Tab {
  DASHBOARD = 'DASHBOARD',
  SINGLE_SENDER = 'SINGLE_SENDER',
  MASS_SENDER = 'MASS_SENDER',
  GROUPS = 'GROUPS',
  SCHEDULED = 'SCHEDULED',
  AUTO_REPLY = 'AUTO_REPLY',
  USERS = 'USERS',
  SETTINGS = 'SETTINGS',
  PROFILES = 'PROFILES'
}