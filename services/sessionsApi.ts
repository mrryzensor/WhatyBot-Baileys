import { getApiUrl, waitForBackendPort } from './api';
import { getCurrentUser } from './authApi';

const getHeaders = () => {
    const user = getCurrentUser();
    return {
        'Content-Type': 'application/json',
        'x-user-id': user?.id?.toString() || '',
        'x-user-role': user?.subscription_type || ''
    };
};

const handleResponse = async (response: Response) => {
    if (!response.ok) {
        const text = await response.text();
        console.error(`API Error (${response.status}):`, text);
        return { success: false, error: `Error ${response.status}` };
    }
    try {
        return await response.json();
    } catch (e) {
        console.error('Failed to parse JSON response:', e);
        return { success: false, error: 'invalid_json' };
    }
};

export const getSessions = async (userId?: number | string) => {
    await waitForBackendPort();
    try {
        let url = `${getApiUrl()}/api/sessions`;
        if (userId) {
            url += `?userId=${userId}`;
        }
        const response = await fetch(url, {
            headers: getHeaders()
        });
        return await handleResponse(response);
    } catch (error) {
        console.error('Network error in getSessions:', error);
        return { success: false, sessions: [] };
    }
};

export const createSession = async () => {
    await waitForBackendPort();
    try {
        const response = await fetch(`${getApiUrl()}/api/sessions`, {
            method: 'POST',
            headers: getHeaders()
        });
        return await handleResponse(response);
    } catch (error) {
        console.error('Network error in createSession:', error);
        return { success: false, error: 'network_error' };
    }
};

export const initializeSession = async (sessionId: string) => {
    await waitForBackendPort();
    try {
        const response = await fetch(`${getApiUrl()}/api/sessions/${sessionId}/initialize`, {
            method: 'POST',
            headers: getHeaders()
        });
        return await handleResponse(response);
    } catch (error) {
        console.error('Network error in initializeSession:', error);
        return { success: false, error: 'network_error' };
    }
};

export const getSessionQR = async (sessionId: string) => {
    await waitForBackendPort();
    try {
        const response = await fetch(`${getApiUrl()}/api/sessions/${sessionId}/qr`, {
            headers: getHeaders()
        });
        return await handleResponse(response);
    } catch (error) {
        console.error('Network error in getSessionQR:', error);
        return { success: false, error: 'network_error' };
    }
};

export const destroySession = async (sessionId: string) => {
    await waitForBackendPort();
    try {
        const response = await fetch(`${getApiUrl()}/api/sessions/${sessionId}`, {
            method: 'DELETE',
            headers: getHeaders()
        });
        return await handleResponse(response);
    } catch (error) {
        console.error('Network error in destroySession:', error);
        return { success: false, error: 'network_error' };
    }
};
