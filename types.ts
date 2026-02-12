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
  announce?: boolean;
  isAdmin?: boolean;
  canSend?: boolean;
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
  messageDelay: number; // seconds (random between 1 and this value)
  maxContactsPerBatch: number; // Maximum contacts per batch
  waitTimeBetweenBatches: number; // Minutes to wait between batches
  chromePath?: string; // Optional Chrome executable path (legacy, not used in Baileys)
  defaultCountryCode?: string; // Default country code for single send (frontend only)
  autoReplyInGroups?: boolean; // Allow auto-replies in group chats (default: false)
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
  mediaPaths?: string[]; // Multiple media files
  captions?: string[]; // Captions for multiple media files
  type?: 'simple' | 'menu'; // Type of auto-reply
  menuId?: string; // ID of menu if type is 'menu'
  countries?: string[]; // Optional: List of countries to match (based on phone prefix)
}

// Interactive Menu System
export interface MenuOption {
  id: string;
  label: string; // Display label for the option
  triggers: string[]; // Triggers that activate this option (e.g., ['1', 'info', 'información'])
  response?: string; // Direct response text
  mediaPaths?: string[]; // Media files to send
  captions?: string[]; // Captions for media
  nextMenuId?: string; // ID of next menu to navigate to
  endConversation?: boolean; // If true, ends the conversation flow
  goBack?: boolean; // If true, navigates back to the previous menu in history
}

export interface InteractiveMenu {
  id: string;
  name: string; // Internal name for the menu
  message: string; // Message to display when entering this menu
  mediaPaths?: string[]; // Media files to send with the menu message
  captions?: string[]; // Captions for menu-level media
  options: MenuOption[];
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserSession {
  userId: string; // WhatsApp ID
  currentMenuId: string; // Current menu the user is in
  history?: string[]; // History of menu IDs visited
  conversationData?: any; // Additional context data
  startTime: string; // ISO string
  lastInteraction: string; // ISO string
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
  CONTACTS = 'CONTACTS',
  GROUPS = 'GROUPS',
  SCHEDULED = 'SCHEDULED',
  AUTO_REPLY = 'AUTO_REPLY',
  MENUS = 'MENUS',
  USERS = 'USERS',
  SETTINGS = 'SETTINGS',
  PROFILES = 'PROFILES'
}