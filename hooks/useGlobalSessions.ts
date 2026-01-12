import { useState, useEffect } from 'react';

const STORAGE_KEY = 'globalSessionsEnabled';

export const useGlobalSessions = () => {
    const [globalSessionsEnabled, setGlobalSessionsEnabled] = useState<boolean>(() => {
        // Load from localStorage
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : true; // Default to true (enabled)
    });

    // Load from backend on mount
    useEffect(() => {
        const loadFromBackend = async () => {
            try {
                const apiUrl = localStorage.getItem('apiUrl') || 'http://localhost:23456';
                const response = await fetch(`${apiUrl}/api/config/global-sessions`);
                const data = await response.json();
                if (data.success) {
                    setGlobalSessionsEnabled(data.enabled);
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(data.enabled));
                }
            } catch (error) {
                console.error('Error loading global sessions config:', error);
            }
        };
        loadFromBackend();
    }, []);

    useEffect(() => {
        // Save to localStorage and backend whenever it changes
        localStorage.setItem(STORAGE_KEY, JSON.stringify(globalSessionsEnabled));

        // Sync with backend
        const syncWithBackend = async () => {
            try {
                const apiUrl = localStorage.getItem('apiUrl') || 'http://localhost:23456';
                await fetch(`${apiUrl}/api/config/global-sessions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ enabled: globalSessionsEnabled })
                });
            } catch (error) {
                console.error('Error syncing global sessions config:', error);
            }
        };
        syncWithBackend();
    }, [globalSessionsEnabled]);

    return {
        globalSessionsEnabled,
        setGlobalSessionsEnabled
    };
};
