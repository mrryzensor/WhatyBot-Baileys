import api from './api';

export interface LoginResponse {
  success: boolean;
  user: any;
  message?: string;
}

export interface RegisterResponse {
  success: boolean;
  user: any;
  message?: string;
}

export const login = async (email: string, password: string): Promise<LoginResponse> => {
  const response = await api.post('/auth/login', { email, password });
  return response.data;
};

export const register = async (email: string, password: string): Promise<RegisterResponse> => {
  const response = await api.post('/auth/register', { email, password });
  return response.data;
};

export const logout = async (): Promise<void> => {
  localStorage.removeItem('user');
  localStorage.removeItem('isAuthenticated');
};

export const getCurrentUser = () => {
  const userStr = localStorage.getItem('user');
  return userStr ? JSON.parse(userStr) : null;
};

export const isAuthenticated = (): boolean => {
  const auth = localStorage.getItem('isAuthenticated');
  const user = localStorage.getItem('user');
  return auth === 'true' && user !== null;
};

