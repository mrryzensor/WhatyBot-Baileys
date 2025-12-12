import api from './api';

export interface User {
  id: number;
  username: string;
  email?: string;
  subscription_type: 'administrador' | 'gratuito' | 'pro' | 'elite';
  subscription_start_date?: string;
  subscription_end_date?: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionInfo {
  type: string;
  limit: number;
  used: number;
  remaining: number;
  price: number;
  startDate?: string;
  endDate?: string;
  isExpired: boolean;
}

export interface SubscriptionLimit {
  type: string;
  messages: number;
  duration: number | null;
  price: number;
}

export interface SubscriptionContactLink {
  subscriptionType: string;
  contactType: 'whatsapp_number' | 'wa_link' | 'payment_link';
  contactValue: string;
}

export const getCurrentUser = async () => {
  const response = await api.get('/users/current');
  return response.data;
};

export const getAllUsers = async () => {
  const response = await api.get('/users');
  return response.data;
};

export const getUserById = async (id: number) => {
  const response = await api.get(`/users/${id}`);
  return response.data;
};

export const createUser = async (
  username: string,
  email: string,
  subscriptionType: string,
  password?: string,
  subscriptionStartDate?: string,
  subscriptionEndDate?: string
) => {
  const response = await api.post('/users', {
    username,
    email,
    subscriptionType,
    password,
    subscriptionStartDate,
    subscriptionEndDate,
  });
  return response.data;
};

export const updateUserSubscription = async (userId: number, subscriptionType: string, durationDays?: number) => {
  const response = await api.put(`/users/${userId}/subscription`, { subscriptionType, durationDays });
  return response.data;
};

export const updateUser = async (userId: number, updates: { username?: string; email?: string; password?: string; subscriptionType?: string; durationDays?: number; subscriptionStartDate?: string; subscriptionEndDate?: string }) => {
  const response = await api.put(`/users/${userId}`, updates);
  return response.data;
};

export const getUserStats = async (userId: number) => {
  const response = await api.get(`/users/${userId}/stats`);
  return response.data;
};

export const deleteUser = async (userId: number) => {
  const response = await api.delete(`/users/${userId}`);
  return response.data;
};

export const deleteUsersBulk = async (userIds: number[]) => {
  const response = await api.delete('/users/bulk', { data: { userIds } });
  return response.data;
};

export const getSubscriptionLimits = async () => {
  const response = await api.get('/users/subscription/limits');
  return response.data;
};

export const updateSubscriptionLimit = async (type: string, updates: { messages?: number; duration?: number; price?: number }) => {
  const response = await api.put(`/users/subscription/limits/${type}`, updates);
  return response.data;
};

// Contact links
export const getSubscriptionContactLinks = async () => {
  const response = await api.get('/users/subscription/contact-links');
  return response.data;
};

export const getSubscriptionContactLink = async (type: string) => {
  const response = await api.get(`/users/subscription/contact-links/${type}`);
  return response.data;
};

export const updateSubscriptionContactLink = async (type: string, contactType: 'whatsapp_number' | 'wa_link' | 'payment_link', contactValue: string) => {
  const response = await api.put(`/users/subscription/contact-links/${type}`, { contactType, contactValue });
  return response.data;
};

