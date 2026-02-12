import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { getSessions, initializeSession as apiInitializeSession, getSessionQR, destroySession as apiDestroySession } from '../services/sessionsApi';
import { getSocket, getApiUrl } from '../services/api';
import { toast } from 'sonner';

interface Session {
    sessionId: string;
    userId: string;
    phoneNumber: string | null;
    status: string;
    createdAt: string;
    isReady: boolean;
}

interface SessionContextType {
    sessions: Session[];
    selectedSessionId: string | null;
    selectedSession: Session | null;
    setSelectedSessionId: (id: string | null) => void;
    loadSessions: () => Promise<void>;
    initializeSession: (sessionId: string) => Promise<boolean>;
    destroySession: (sessionId: string) => Promise<boolean>;
    refreshQR: (sessionId: string) => Promise<string | null>;
    clearSessions: () => void;
    loading: boolean;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(() => {
        return localStorage.getItem('selectedSessionId');
    });
    const [loading, setLoading] = useState(false);
    const selectedSessionRef = useRef<string | null>(selectedSessionId);

    useEffect(() => {
        selectedSessionRef.current = selectedSessionId;
        if (selectedSessionId) {
            localStorage.setItem('selectedSessionId', selectedSessionId);

            const socket = getSocket();
            if (socket && socket.connected) {
                socket.emit('select_session', selectedSessionId);
            }

            // Sync with backend as active session
            const syncActiveSession = async () => {
                try {
                    // Use centralized API URL getter
                    const apiUrl = getApiUrl();
                    await fetch(`${apiUrl}/api/config/global-sessions`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ activeSessionId: selectedSessionId }) // Only send activeSessionId to update it without toggling enabled
                    });
                } catch (error) {
                    // Silent fail is better here as it's just a sync preference
                    console.warn('Sync active session warning:', error);
                }
            };
            syncActiveSession();
        } else {
            localStorage.removeItem('selectedSessionId');
        }
    }, [selectedSessionId]);

    const clearSessions = () => {
        setSessions([]);
        setSelectedSessionId(null);
        localStorage.removeItem('selectedSessionId');
        selectedSessionRef.current = null;
    };

    const loadSessions = async () => {
        // Prevent loading if not logged in
        if (!localStorage.getItem('user')) {
            clearSessions();
            return;
        }

        try {
            setLoading(true);
            const response = await getSessions();
            if (response.success) {
                setSessions(response.sessions);

                // If we have a selected session, verify it still exists
                if (selectedSessionRef.current) {
                    const exists = response.sessions.find((s: Session) => s.sessionId === selectedSessionRef.current);
                    if (!exists) {
                        // Session no longer exists, clear selection
                        setSelectedSessionId(null);
                        selectedSessionRef.current = null; // Update ref immediately for subsequent logic
                    }
                }

                // If nothing selected (or just cleared), try to select the first connected or available session
                if (!selectedSessionRef.current && response.sessions.length > 0) {
                    const active = response.sessions.find((s: Session) => s.isReady || s.status === 'connected');
                    if (active) {
                        setSelectedSessionId(active.sessionId);
                    } else {
                        setSelectedSessionId(response.sessions[0].sessionId);
                    }
                }
            }
        } catch (error) {
            console.error('Error loading sessions:', error);
        } finally {
            setLoading(false);
        }
    };

    const initializeSession = async (sessionId: string) => {
        try {
            const response = await apiInitializeSession(sessionId);
            if (response.success) {
                await loadSessions();
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error initializing session:', error);
            return false;
        }
    };

    const destroySession = async (sessionId: string) => {
        try {
            const response = await apiDestroySession(sessionId);
            if (response.success) {
                if (selectedSessionId === sessionId) {
                    setSelectedSessionId(null);
                }
                await loadSessions();
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error destroying session:', error);
            return false;
        }
    };

    const refreshQR = async (sessionId: string) => {
        try {
            const response = await getSessionQR(sessionId);
            if (response.success && response.qr) {
                return response.qr;
            }
            return null;
        } catch (error) {
            console.error('Error refreshing QR:', error);
            return null;
        }
    };

    useEffect(() => {
        loadSessions();

        const setupListeners = () => {
            const socket = getSocket();
            if (!socket) return;

            socket.on('session_created', (data: any) => {
                loadSessions();
            });

            socket.on('session_updated', (data: any) => {
                setSessions(prev => prev.map(s =>
                    s.sessionId === data.sessionId ? { ...s, ...data } : s
                ));
            });

            socket.on('session_destroyed', (data: any) => {
                setSessions(prev => prev.filter(s => s.sessionId !== data.sessionId));
                setSelectedSessionId(prev => prev === data.sessionId ? null : prev);
            });

            socket.on('session_status', (data: any) => {
                setSessions(prev => prev.map(s =>
                    s.sessionId === data.sessionId ? { ...s, ...data } : s
                ));
            });

            socket.on('ready', (data: any) => {
                if (data.sessionId) {
                    setSessions(prev => prev.map(s =>
                        s.sessionId === data.sessionId ? { ...s, status: 'connected', isReady: true, phoneNumber: data.phone } : s
                    ));
                }
            });
        };

        const interval = setInterval(() => {
            if (getSocket()) {
                setupListeners();
                clearInterval(interval);
            }
        }, 1000);

        return () => {
            clearInterval(interval);
            const socket = getSocket();
            if (socket) {
                socket.off('session_created');
                socket.off('session_updated');
                socket.off('session_destroyed');
                socket.off('ready');
            }
        };
    }, []);

    const selectedSession = sessions.find(s => s.sessionId === selectedSessionId) || null;

    return (
        <SessionContext.Provider value={{
            sessions,
            selectedSessionId,
            selectedSession,
            setSelectedSessionId,
            loadSessions,
            initializeSession,
            destroySession,
            refreshQR,
            clearSessions,
            loading
        }}>
            {children}
        </SessionContext.Provider>
    );
};

export const useSession = () => {
    const context = useContext(SessionContext);
    if (context === undefined) {
        throw new Error('useSession must be used within a SessionProvider');
    }
    return context;
};
