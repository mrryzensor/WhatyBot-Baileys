import axios from 'axios';
import type { AxiosRequestConfig } from 'axios';
import { io, Socket } from 'socket.io-client';
import { ScheduleType } from '../types';

const DEFAULT_BACKEND_PORT = parseInt(import.meta.env.VITE_BACKEND_PORT || '23456', 10);
const DISCOVERY_TIMEOUT_MS = 3000;
const DISCOVERY_RANGE = 20; // How many ports ahead of the base we probe automatically

let backendPortReadyResolve: (() => void) | null = null;
let backendPortReadyResolved = false;
const backendPortReadyPromise = new Promise<void>((resolve) => {
  backendPortReadyResolve = resolve;
});

const markBackendPortReady = () => {
  if (backendPortReadyResolved) return;
  backendPortReadyResolved = true;
  backendPortReadyResolve?.();
};

export const waitForBackendPort = () => backendPortReadyPromise;

const getStoredBackendPort = (): number | null => {
  try {
    const savedPort = localStorage.getItem('backendPort');
    if (savedPort) {
      const parsed = parseInt(savedPort, 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  } catch (error) {
    console.warn('Could not read backend port:', error);
  }
  return null;
};

const fetchPortInfo = async (): Promise<number | null> => {
  try {
    const response = await fetch('/.port-info.json', {
      headers: {
        'Cache-Control': 'no-cache'
      }
    });
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    const port = parseInt(data?.backendPort, 10);
    if (Number.isFinite(port)) {
      return port;
    }
  } catch (error) {
    // Ignore, fallback to discovery
  }
  return null;
};

const clampPort = (port: number) => Math.max(1, Math.min(65535, port));

let lastResolvedBackendPort = getStoredBackendPort() ?? DEFAULT_BACKEND_PORT;

const getBackendCandidates = (): number[] => {
  const candidateSet = new Set<number>();

  const addPort = (port?: number | null) => {
    if (port === null || port === undefined) return;
    if (!Number.isFinite(port)) return;
    candidateSet.add(clampPort(port));
  };

  const addRange = (start: number, count: number) => {
    for (let i = 0; i < count; i++) {
      addPort(start + i);
    }
  };

  // Prioritize the last resolved/stored port and its surroundings
  addPort(lastResolvedBackendPort);
  addRange(lastResolvedBackendPort - 2, 5);

  // Cover the default base range (base .. base + DISCOVERY_RANGE)
  addRange(DEFAULT_BACKEND_PORT, DISCOVERY_RANGE + 1);

  // Ensure we probe the original explicit fallback ports
  addRange(23456, 4);

  return Array.from(candidateSet.values());
};

const getApiBaseUrl = (): string => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  const storedPort = getStoredBackendPort();
  const port = storedPort ?? DEFAULT_BACKEND_PORT;
  return `http://localhost:${port}`;
};

// Initialize API base URL - will be updated when port info is available
let API_BASE_URL = getApiBaseUrl();

// Function to update API base URL when port info is available
export const updateApiBaseUrl = (port: number) => {
  API_BASE_URL = `http://localhost:${port}`;
  lastResolvedBackendPort = port;
  localStorage.setItem('backendPort', port.toString());
  // Recreate axios instance with new base URL
  api.defaults.baseURL = `${API_BASE_URL}/api`;
  // Reconnect socket if it exists
  if (socket) {
    socket.disconnect();
    socket = null;
    initializeSocket();
  }
  markBackendPortReady();
};

type DiscoverOptions = {
  delayMs?: number;
  force?: boolean;
  maxRounds?: number;
  retryDelayMs?: number;
};

let discoverPromise: Promise<void> | null = null;

const discoverBackendPort = async (options: DiscoverOptions = {}) => {
  if (import.meta.env.VITE_API_URL) return;

  if (discoverPromise && !options.force) {
    return discoverPromise;
  }

  const performDiscovery = async () => {
    if (options.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }

    const maxRounds = options.maxRounds ?? 5;
    const retryDelayMs = options.retryDelayMs ?? 2000;

    for (let round = 0; round < maxRounds; round++) {
      const candidates = getBackendCandidates();
      for (const port of candidates) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
          const response = await fetch(`http://localhost:${port}/api/status`, {
            signal: controller.signal
          });
          clearTimeout(timeout);

          if (!response.ok) {
            continue;
          }

          let data: any = null;
          try {
            data = await response.json();
          } catch (error) {
            continue;
          }

          if (data?.status === 'ok') {
            updateApiBaseUrl(port);
            console.log(`✅ Backend API URL updated to: ${API_BASE_URL} (detected automatically)`);
            return;
          }
        } catch (error) {
          // Ignore and try next port
        }
      }

      if (round < maxRounds - 1) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }

    console.warn('Could not auto-detect backend port after multiple attempts, continuing with default.');
  };

  discoverPromise = performDiscovery()
    .catch((error) => {
      console.warn('Backend discovery failed:', error);
      if (!backendPortReadyResolved) {
        updateApiBaseUrl(DEFAULT_BACKEND_PORT);
      }
    })
    .finally(() => {
      markBackendPortReady();
      discoverPromise = null;
    });

  return discoverPromise;
};

// Try to resolve backend port on initialization
if (typeof window !== 'undefined') {
  // In production (Electron), the port is set in localStorage by Electron
  // In development, try to fetch from .port-info.json
  const isProduction = !import.meta.env.DEV;
  
  if (isProduction) {
    // In production, check localStorage first (set by Electron)
    const savedPort = localStorage.getItem('backendPort');
    if (savedPort) {
      const port = parseInt(savedPort, 10);
      updateApiBaseUrl(port);
      console.log(`✅ Backend API URL set to: ${API_BASE_URL} (from localStorage)`);
    } else {
      // Wait a bit for Electron to set it
      setTimeout(() => {
        const savedPort = localStorage.getItem('backendPort');
        if (savedPort) {
          const port = parseInt(savedPort, 10);
          updateApiBaseUrl(port);
          console.log(`✅ Backend API URL updated to: ${API_BASE_URL} (from localStorage)`);
        } else {
          console.log('Using default backend port 23456');
        }
      }, 1000);
    }
  } else {
    const initializePort = async () => {
      const portInfo = await fetchPortInfo();
      if (portInfo) {
        updateApiBaseUrl(portInfo);
        console.log(`✅ Backend API URL set to: ${API_BASE_URL} (from .port-info.json)`);
      } else {
        await discoverBackendPort({ delayMs: 500 });
      }
    };
    initializePort();
  }
}

if (typeof window === 'undefined' || import.meta.env.VITE_API_URL) {
  markBackendPortReady();
}

// Create axios instance
const api = axios.create({
    baseURL: `${API_BASE_URL}/api`,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add interceptor to include userId in headers
api.interceptors.request.use((config) => {
    // Get current user from localStorage (stored as 'user')
    const userStr = localStorage.getItem('user');
    if (userStr) {
        try {
            const user = JSON.parse(userStr);
            if (user && user.id) {
                config.headers['x-user-id'] = user.id.toString();
            }
        } catch (e) {
            console.warn('Error parsing user from localStorage:', e);
        }
    }
    return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = (error?.config || {}) as AxiosRequestConfig & {
      __retryAfterPortDetect?: boolean;
    };
    const isNetworkError = error?.code === 'ERR_NETWORK' || error?.message === 'Network Error';

    if (isNetworkError && !config.__retryAfterPortDetect) {
      config.__retryAfterPortDetect = true;
      await discoverBackendPort({ force: true });
      config.baseURL = api.defaults.baseURL;
      return api(config);
    }

    return Promise.reject(error);
  }
);

// Socket.io client
let socket: Socket | null = null;

export const initializeSocket = () => {
    if (!socket) {
        console.log('Connecting to Socket.io server at:', API_BASE_URL);
        socket = io(API_BASE_URL, {
            transports: ['polling', 'websocket'], // Try polling first
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 10,
            withCredentials: true
        });

        socket.on('connect', () => {
            console.log('Socket.io connected successfully!');
        });

        socket.on('connect_error', (error) => {
            console.error('Socket.io connection error:', error);
            discoverBackendPort({ force: true }).catch(() => {});
        });

        socket.on('disconnect', (reason) => {
            console.log('Socket.io disconnected:', reason);
            if (reason === 'transport close' || reason === 'ping timeout') {
                discoverBackendPort({ force: true }).catch(() => {});
            }
        });
    }
    return socket;
};

export const getSocket = () => socket;

export const resetWhatsAppSession = async () => {
  await waitForBackendPort();
  const response = await api.post('/reset-session');
  return response.data;
};

// API Methods

// Status
export const getStatus = async () => {
    const response = await api.get('/status');
    return response.data;
};

// Configuration
export const getConfig = async () => {
    const response = await api.get('/config');
    return response.data;
};

export const updateConfig = async (config: any) => {
    const response = await api.post('/config', config);
    return response.data;
};

export const logout = async () => {
    const response = await api.post('/logout');
    return response.data;
};

export const initialize = async () => {
    const response = await api.post('/initialize');
    return response.data;
};

// Get current QR code (DataURL)
export const getQr = async () => {
    const response = await api.get('/qr');
    return response.data;
};

// Get message logs
export const getMessageLogs = async (limit: number = 100) => {
    const response = await api.get(`/messages/logs?limit=${limit}`);
    return response.data;
};

// Messages
export const sendMessage = async (to: string, message: string, scheduledAt?: Date) => {
    const response = await api.post('/messages/send', { to, message, scheduledAt });
    return response.data;
};

export const sendMediaMessage = async (
    to: string,
    message: string,
    files: File[],
    captions?: string[],
    scheduledAt?: Date
) => {
    const formData = new FormData();
    formData.append('to', to);
    formData.append('message', message); // Text message sent separately

    // Enviar todos los archivos
    files.forEach((file) => {
        formData.append('media', file);
    });

    // Enviar captions como array JSON (opcional)
    if (captions && captions.length > 0) {
        formData.append('captions', JSON.stringify(captions));
    }

    if (scheduledAt) {
        formData.append('scheduledAt', scheduledAt.toISOString());
    }

    const response = await api.post('/messages/send-media', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
    return response.data;
};

export const sendBulkMessages = async (
    contacts: any[],
    message: string,
    files?: File[],
    captions?: string[],
    scheduledAt?: Date
) => {
    const formData = new FormData();
    formData.append('contacts', JSON.stringify(contacts));
    formData.append('message', message); // Text message sent separately
    // Delay is now handled by server configuration (in seconds, random between 1 and configured value)

    if (files && files.length > 0) {
        files.forEach((file) => {
            formData.append('media', file);
        });
    }
    if (captions && captions.length > 0) {
        formData.append('captions', JSON.stringify(captions));
    }
    if (scheduledAt) {
        formData.append('scheduledAt', scheduledAt.toISOString());
    }

    const response = await api.post('/messages/send-bulk', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
    return response.data;
};

// Bulk control (pause/resume/cancel)
export const pauseBulk = async () => {
    const response = await api.post('/messages/bulk/pause');
    return response.data;
};

export const resumeBulk = async () => {
    const response = await api.post('/messages/bulk/resume');
    return response.data;
};

export const cancelBulk = async () => {
    const response = await api.post('/messages/bulk/cancel');
    return response.data;
};

// Scheduled jobs (single/bulk/groups)
export const getScheduledJobs = async () => {
    const response = await api.get('/messages/scheduled');
    return response.data;
};

export const cancelScheduledJob = async (jobId: string) => {
    const response = await api.delete(`/messages/scheduled/${jobId}`);
    return response.data;
};

export const updateScheduledJob = async (jobId: string, scheduledAt: Date) => {
    const response = await api.put(`/messages/scheduled/${jobId}`, {
        scheduledAt: scheduledAt.toISOString(),
    });
    return response.data;
};

// Groups
export const getGroups = async () => {
    const response = await api.get('/groups');
    return response.data;
};

export const getGroupMembers = async (groupId: string) => {
    const response = await api.get(`/groups/${groupId}/members`);
    return response.data;
};

export const sendGroupMessages = async (
    groupIds: string[], 
    message: string, 
    files?: File[],
    captions?: string[]
) => {
    const formData = new FormData();
    formData.append('groupIds', JSON.stringify(groupIds));
    formData.append('message', message);
    if (files && files.length > 0) {
        files.forEach((file) => {
            formData.append('media', file);
        });
    }
    if (captions && captions.length > 0) {
        formData.append('captions', JSON.stringify(captions));
    }

    const response = await api.post('/groups/send', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
    return response.data;
};

export const scheduleGroupMessages = async (
    groupIds: string[],
    message: string,
    scheduleType: ScheduleType,
    delayMinutes?: number,
    scheduledAt?: Date,
    files?: File[],
    captions?: string[]
) => {
    const formData = new FormData();
    formData.append('groupIds', JSON.stringify(groupIds));
    formData.append('message', message);
    formData.append('scheduleType', scheduleType);
    if (delayMinutes !== undefined) {
        formData.append('delayMinutes', delayMinutes.toString());
    }
    if (scheduledAt) {
        formData.append('scheduledAt', scheduledAt.toISOString());
    }
    if (files && files.length > 0) {
        files.forEach((file) => {
            formData.append('media', file);
        });
    }
    if (captions && captions.length > 0) {
        formData.append('captions', JSON.stringify(captions));
    }

    const response = await api.post('/groups/schedule', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
    return response.data;
};

export const scheduleBulkMessages = async (
    contacts: any[],
    message: string,
    scheduleType: ScheduleType,
    delayMinutes?: number,
    scheduledAt?: Date,
    files?: File[],
    captions?: string[]
) => {
    const formData = new FormData();
    formData.append('contacts', JSON.stringify(contacts));
    formData.append('message', message); // Text message sent separately
    
    // Delay is now handled by server configuration (in seconds, random between 1 and configured value)
    // No need to send delay parameter, server will use its configured value
    
    // Calculate scheduledAt based on scheduleType
    let finalScheduledAt: Date | undefined;
    if (scheduleType === 'datetime' && scheduledAt) {
        // For datetime type, use the provided scheduledAt
        finalScheduledAt = scheduledAt;
    } else if (scheduleType === 'delay' && delayMinutes) {
        // For delay type, schedule to start after delayMinutes from now
        finalScheduledAt = new Date(Date.now() + (delayMinutes * 60 * 1000));
    }
    // For 'now' type, don't set scheduledAt (will send immediately)
    
    if (finalScheduledAt) {
        formData.append('scheduledAt', finalScheduledAt.toISOString());
    }
    
    if (files && files.length > 0) {
        files.forEach((file) => {
            formData.append('media', file);
        });
    }
    
    if (captions && captions.length > 0) {
        formData.append('captions', JSON.stringify(captions)); // Captions for media
    }

    // Use /send-bulk endpoint which handles both immediate and scheduled messages
    const response = await api.post('/messages/send-bulk', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
    return response.data;
};

// Contacts
export const getContacts = async () => {
    const response = await api.get('/contacts');
    return response.data;
};

// Auto-reply rules
export const getAutoReplyRules = async () => {
    const response = await api.get('/auto-reply/rules');
    return response.data;
};

export const createAutoReplyRule = async (rule: any, files?: File[], captions?: string[]) => {
    const formData = new FormData();
    formData.append('name', rule.name);
    formData.append('keywords', JSON.stringify(rule.keywords));
    formData.append('response', rule.response || '');
    formData.append('matchType', rule.matchType);
    formData.append('delay', rule.delay?.toString() || '0');
    formData.append('isActive', rule.isActive?.toString() || 'true');
    if (captions && captions.length > 0) {
        formData.append('captions', JSON.stringify(captions));
    }
    if (rule.caption) {
        formData.append('caption', rule.caption);
    }
    if (files && files.length > 0) {
        files.forEach((file) => {
            formData.append('media', file);
        });
    }

    const response = await api.post('/auto-reply/rules', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
    return response.data;
};

export const updateAutoReplyRule = async (id: string, rule: any, files?: File[], existingMediaPaths?: string[]) => {
    const formData = new FormData();
    formData.append('name', rule.name);
    formData.append('keywords', JSON.stringify(rule.keywords));
    formData.append('response', rule.response || '');
    formData.append('matchType', rule.matchType);
    formData.append('delay', rule.delay?.toString() || '0');
    formData.append('isActive', rule.isActive?.toString() || 'true');
    if (rule.caption) {
        formData.append('caption', rule.caption);
    }
    if (files && files.length > 0) {
        files.forEach((file) => {
            formData.append('media', file);
        });
    }
    if (rule.captions && Array.isArray(rule.captions) && rule.captions.length > 0) {
        formData.append('captions', JSON.stringify(rule.captions));
    }
    // If no new files but we have existing mediaPaths, preserve them (como JSON)
    if ((!files || files.length === 0) && existingMediaPaths && existingMediaPaths.length > 0) {
        formData.append('existingMediaPaths', JSON.stringify(existingMediaPaths));
    }

    const response = await api.put(`/auto-reply/rules/${id}`, formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
    return response.data;
};

export const deleteAutoReplyRule = async (id: string) => {
    const response = await api.delete(`/auto-reply/rules/${id}`);
    return response.data;
};

export const importAutoReplyRules = async (rules: any[]) => {
    const response = await api.post('/auto-reply/rules/import', { rules });
    return response.data;
};

// Group Selections
export const getGroupSelections = async () => {
    const response = await api.get('/groups/selections');
    return response.data;
};

export const createGroupSelection = async (name: string, description: string, groupIds: string[]) => {
    const response = await api.post('/groups/selections', { name, description, groupIds });
    return response.data;
};

export const updateGroupSelection = async (id: string, name: string, description: string, groupIds: string[]) => {
    const response = await api.put(`/groups/selections/${id}`, { name, description, groupIds });
    return response.data;
};

export const deleteGroupSelection = async (id: string) => {
    const response = await api.delete(`/groups/selections/${id}`);
    return response.data;
};

export default api;
