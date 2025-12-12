import React, { useState, useEffect, useMemo } from 'react';
import { Users, Crown, Gift, Zap, Trash2, Edit2, Plus, TrendingUp, Calendar, MessageCircle, X, Search, ArrowUpDown, ArrowUp, ArrowDown, Upload } from 'lucide-react';
import { User, SubscriptionInfo, SubscriptionLimit } from '../services/usersApi';
import { 
  getAllUsers, 
  createUser, 
  updateUserSubscription, 
  updateUser,
  deleteUser,
  deleteUsersBulk,
  getSubscriptionLimits,
  getUserStats,
  updateSubscriptionLimit,
  getSubscriptionContactLinks,
  updateSubscriptionContactLink,
  SubscriptionContactLink
} from '../services/usersApi';
import { BulkUserCreator } from './BulkUserCreator';
import { ConfirmModal } from './ConfirmModal';

interface UserManagerProps {
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    warning: (message: string) => void;
    info: (message: string) => void;
  };
}

type SortField = 'username' | 'email' | 'subscription_type' | 'subscription_start_date' | 'subscription_end_date' | 'created_at';
type SortDirection = 'asc' | 'desc';

export const UserManager: React.FC<UserManagerProps> = ({ toast }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [subscriptionLimits, setSubscriptionLimits] = useState<SubscriptionLimit[]>([]);
  const [contactLinks, setContactLinks] = useState<SubscriptionContactLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [showBulkCreator, setShowBulkCreator] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [editingLimit, setEditingLimit] = useState<SubscriptionLimit | null>(null);
  const [editingContactLink, setEditingContactLink] = useState<{ type: string; contactType: string; contactValue: string } | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [limitMessages, setLimitMessages] = useState<number>(0);
  const [limitDuration, setLimitDuration] = useState<number | null>(null);
  const [limitPrice, setLimitPrice] = useState<number>(0);
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editSubscriptionType, setEditSubscriptionType] = useState<string>('');
  const [editDurationDays, setEditDurationDays] = useState<number | null>(null);
  const [editStartDate, setEditStartDate] = useState<string>('');
  const [editEndDate, setEditEndDate] = useState<string>('');
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [bulkSubscriptionType, setBulkSubscriptionType] = useState<string>('');
  const [bulkPassword, setBulkPassword] = useState<string>('');
  const [linkContactType, setLinkContactType] = useState<'whatsapp_number' | 'wa_link' | 'payment_link'>('whatsapp_number');
  const [linkContactValue, setLinkContactValue] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<number | null>(null);
  const [deleteProgress, setDeleteProgress] = useState<{ current: number; total: number; isDeleting: boolean }>({ current: 0, total: 0, isDeleting: false });
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadUsers();
    loadSubscriptionLimits();
    loadContactLinks();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await getAllUsers();
      if (response.success) {
        setUsers(response.users);
      }
    } catch (error: any) {
      toast.error(`Error al cargar usuarios: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadSubscriptionLimits = async () => {
    try {
      const response = await getSubscriptionLimits();
      if (response.success) {
        setSubscriptionLimits(response.limits);
      }
    } catch (error: any) {
      console.error('Error loading subscription limits:', error);
    }
  };

  const loadContactLinks = async () => {
    try {
      const response = await getSubscriptionContactLinks();
      if (response.success) {
        setContactLinks(response.links || []);
      }
    } catch (error: any) {
      console.error('Error loading contact links:', error);
    }
  };

  const handleEditLimit = (limit: SubscriptionLimit) => {
    setEditingLimit(limit);
    setLimitMessages(limit.messages === Infinity ? 0 : limit.messages);
    setLimitDuration(limit.duration);
    setLimitPrice(limit.price || 0);
  };

  const handleSaveLimit = async () => {
    if (!editingLimit) return;
    
    try {
      const updates: any = {};
      if (limitMessages !== undefined) {
        updates.messages = limitMessages === 0 && editingLimit.type === 'administrador' ? Infinity : limitMessages;
      }
      if (limitDuration !== undefined) {
        updates.duration = limitDuration;
      }
      if (limitPrice !== undefined) {
        updates.price = limitPrice;
      }
      
      const response = await updateSubscriptionLimit(editingLimit.type, updates);
      if (response.success) {
        toast.success('Límite actualizado exitosamente');
        setEditingLimit(null);
        loadSubscriptionLimits();
      }
    } catch (error: any) {
      toast.error(`Error al actualizar límite: ${error.message}`);
    }
  };

  const handleEditContactLink = (limit: SubscriptionLimit) => {
    const existingLink = contactLinks.find(l => l.subscriptionType === limit.type);
    setEditingContactLink({
      type: limit.type,
      contactType: existingLink?.contactType || 'whatsapp_number',
      contactValue: existingLink?.contactValue || '51977638887'
    });
    setLinkContactType(existingLink?.contactType || 'whatsapp_number');
    setLinkContactValue(existingLink?.contactValue || '51977638887');
  };

  const handleSaveContactLink = async () => {
    if (!editingContactLink) return;
    
    try {
      const response = await updateSubscriptionContactLink(
        editingContactLink.type,
        linkContactType,
        linkContactValue
      );
      if (response.success) {
        toast.success('Enlace de contacto actualizado exitosamente');
        setEditingContactLink(null);
        setLinkContactType('whatsapp_number');
        setLinkContactValue('');
        loadContactLinks();
      }
    } catch (error: any) {
      toast.error(`Error al actualizar enlace: ${error.message}`);
    }
  };

  const handleOpenCreateUser = () => {
    setIsCreatingUser(true);
    setEditingUser(null);
    setEditUsername('');
    setEditEmail('');
    setEditPassword('');
    setEditSubscriptionType('gratuito');
    setEditDurationDays(null);
    setEditStartDate('');
    setEditEndDate('');
  };

  const handleUpdateSubscription = async (userId: number, subscriptionType: string) => {
    try {
      const response = await updateUserSubscription(userId, subscriptionType);
      if (response.success) {
        toast.success('Suscripción actualizada exitosamente');
        loadUsers();
      }
    } catch (error: any) {
      toast.error(`Error al actualizar suscripción: ${error.message}`);
    }
  };

  const handleDeleteUser = (userId: number) => {
    setUserToDelete(userId);
    setShowDeleteModal(true);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;

    setIsDeleting(true);
    try {
      const response = await deleteUser(userToDelete);
      if (response.success) {
        toast.success('Usuario eliminado exitosamente');
        setSelectedUsers(new Set());
        loadUsers();
      }
    } catch (error: any) {
      toast.error(`Error al eliminar usuario: ${error.message}`);
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
      setUserToDelete(null);
    }
  };

  const handleDeleteBulk = () => {
    if (selectedUsers.size === 0) {
      toast.warning('Selecciona al menos un usuario para eliminar');
      return;
    }

    setShowBulkDeleteModal(true);
  };

  const confirmDeleteBulk = async () => {
    const userIds = Array.from(selectedUsers) as number[];
    const total = userIds.length;
    
    setDeleteProgress({ current: 0, total, isDeleting: true });
    const results = { success: 0, failed: 0 };
    
    for (let i = 0; i < userIds.length; i++) {
      try {
        await deleteUser(userIds[i]);
        results.success++;
      } catch (error: any) {
        results.failed++;
      }
      setDeleteProgress({ current: i + 1, total, isDeleting: true });
    }
    
    setDeleteProgress({ current: 0, total: 0, isDeleting: false });
    setShowBulkDeleteModal(false);
    
    if (results.success > 0) {
      toast.success(`${results.success} usuario(s) eliminado(s) exitosamente`);
      setSelectedUsers(new Set());
      loadUsers();
    }
    if (results.failed > 0) {
      toast.error(`${results.failed} usuario(s) no se pudieron eliminar`);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedUsers(new Set(filteredAndSortedUsers.map(u => u.id)));
    } else {
      setSelectedUsers(new Set());
    }
  };

  const handleSelectUser = (userId: number, checked: boolean) => {
    const newSelected = new Set(selectedUsers);
    if (checked) {
      newSelected.add(userId);
    } else {
      newSelected.delete(userId);
    }
    setSelectedUsers(newSelected);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const filteredAndSortedUsers = useMemo(() => {
    let filtered = users.filter(user => {
      const query = searchQuery.toLowerCase();
      return (
        user.username.toLowerCase().includes(query) ||
        (user.email && user.email.toLowerCase().includes(query)) ||
        user.subscription_type.toLowerCase().includes(query)
      );
    });

    filtered.sort((a, b) => {
      let aValue: any = a[sortField];
      let bValue: any = b[sortField];

      if (sortField === 'subscription_start_date' || sortField === 'subscription_end_date' || sortField === 'created_at') {
        aValue = aValue ? new Date(aValue).getTime() : 0;
        bValue = bValue ? new Date(bValue).getTime() : 0;
      } else {
        aValue = aValue || '';
        bValue = bValue || '';
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [users, searchQuery, sortField, sortDirection]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown size={14} className="text-slate-400" />;
    }
    return sortDirection === 'asc' ? 
      <ArrowUp size={14} className="text-blue-600" /> : 
      <ArrowDown size={14} className="text-blue-600" />;
  };

  const handleEditUser = (user: User) => {
    setIsCreatingUser(false);
    setEditingUser(user);
    setEditUsername(user.username);
    setEditEmail(user.email || '');
    setEditPassword('');
    setEditSubscriptionType(user.subscription_type);
    
    // Set dates
    if (user.subscription_start_date) {
      const startDate = new Date(user.subscription_start_date);
      setEditStartDate(startDate.toISOString().split('T')[0]);
    } else {
      setEditStartDate('');
    }
    
    if (user.subscription_end_date) {
      const endDate = new Date(user.subscription_end_date);
      setEditEndDate(endDate.toISOString().split('T')[0]);
    } else {
      setEditEndDate('');
    }
    
    // Calculate duration from dates
    if (user.subscription_start_date && user.subscription_end_date) {
      const start = new Date(user.subscription_start_date);
      const end = new Date(user.subscription_end_date);
      const diffTime = end.getTime() - start.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      setEditDurationDays(diffDays);
    } else {
      setEditDurationDays(null);
    }
  };

  const handleStartDateIncrement = (months: number) => {
    // Los botones de inicio calculan la fecha de fin basándose en: fecha inicio + meses
    if (!editStartDate) {
      // Si no hay fecha de inicio, usar hoy como referencia
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const newEndDate = new Date(today);
      newEndDate.setMonth(newEndDate.getMonth() + months);
      setEditEndDate(newEndDate.toISOString().split('T')[0]);
    } else {
      // Calcular fecha de fin = fecha inicio + meses
      const startDate = new Date(editStartDate);
      const newEndDate = new Date(startDate);
      newEndDate.setMonth(newEndDate.getMonth() + months);
      setEditEndDate(newEndDate.toISOString().split('T')[0]);
    }
  };

  const handleEndDateIncrement = (months: number) => {
    // Los botones de fin incrementan la fecha de fin según el botón presionado
    if (!editEndDate) {
      // Si no hay fecha de fin, usar fecha inicio o hoy como referencia
      const baseDate = editStartDate ? new Date(editStartDate) : new Date();
      baseDate.setHours(0, 0, 0, 0);
      const newEndDate = new Date(baseDate);
      newEndDate.setMonth(newEndDate.getMonth() + months);
      setEditEndDate(newEndDate.toISOString().split('T')[0]);
    } else {
      // Incrementar la fecha de fin
      const endDate = new Date(editEndDate);
      const newEndDate = new Date(endDate);
      newEndDate.setMonth(newEndDate.getMonth() + months);
      setEditEndDate(newEndDate.toISOString().split('T')[0]);
    }
  };

  const handleBulkUpdate = async () => {
    if (selectedUsers.size === 0) {
      toast.warning('Selecciona al menos un usuario para actualizar');
      return;
    }

    if (!bulkSubscriptionType && !bulkPassword) {
      toast.warning('Selecciona al menos un campo para actualizar');
      return;
    }

    try {
      const userIds = Array.from(selectedUsers);
      const updates: any = {};
      if (bulkSubscriptionType) {
        updates.subscriptionType = bulkSubscriptionType;
      }
      // Update password - use provided or default
      if (bulkPassword.trim()) {
        updates.password = bulkPassword;
      } else {
        // If empty, use default password
        updates.password = '2748curso';
      }

      const results = { success: 0, failed: 0, errors: [] as string[] };
      
      for (const userId of userIds) {
        try {
          await updateUser(Number(userId), updates);
          results.success++;
        } catch (error: any) {
          results.failed++;
          results.errors.push(`Usuario ${userId}: ${error.response?.data?.error || error.message}`);
        }
      }

      if (results.success > 0) {
        toast.success(`${results.success} usuario(s) actualizado(s) exitosamente`);
      }
      if (results.failed > 0) {
        toast.error(`${results.failed} usuario(s) fallaron. Errores: ${results.errors.slice(0, 3).join(', ')}`);
      }

      if (results.success > 0) {
        setSelectedUsers(new Set());
        setShowBulkEditModal(false);
        setBulkSubscriptionType('');
        setBulkPassword('');
        loadUsers();
      }
    } catch (error: any) {
      toast.error(`Error al actualizar usuarios: ${error.message}`);
    }
  };

  const handleSaveUser = async () => {
    // If creating new user
    if (isCreatingUser) {
      // Email is required
      if (!editEmail.trim()) {
        toast.error('El correo electrónico es requerido');
        return;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(editEmail.trim())) {
        toast.error('Por favor ingresa un correo electrónico válido');
        return;
      }

      // Generate username from email if not provided
      const username = editUsername.trim() || generateUsernameFromEmail(editEmail);
      
      if (!username) {
        toast.error('No se pudo generar el nombre de usuario desde el correo');
        return;
      }

      setIsSaving(true);
      try {
        const response = await createUser(username, editEmail.trim(), editSubscriptionType || 'gratuito', editPassword || undefined);
        if (response.success) {
          toast.success('Usuario creado exitosamente');
          handleCloseUserModal();
          loadUsers();
        }
      } catch (error: any) {
        toast.error(`Error al crear usuario: ${error.message}`);
      } finally {
        setIsSaving(false);
      }
      return;
    }

    // If editing existing user
    if (!editingUser) return;
    
    setIsSaving(true);
    try {
      const updates: any = {};
      // Username is optional - only update if changed and not empty
      if (editUsername.trim() && editUsername !== editingUser.username) {
        updates.username = editUsername.trim();
      }
      if (editEmail !== editingUser.email) {
        updates.email = editEmail;
      }
      if (editPassword.trim()) {
        updates.password = editPassword;
      }
      if (editSubscriptionType !== editingUser.subscription_type) {
        updates.subscriptionType = editSubscriptionType;
      }
      
      // Handle dates
      if (editStartDate) {
        updates.subscriptionStartDate = editStartDate;
      }
      if (editEndDate) {
        updates.subscriptionEndDate = editEndDate;
      }
      
      if (editDurationDays !== null && editDurationDays !== undefined) {
        updates.durationDays = editDurationDays;
      }
      
      const response = await updateUser(editingUser.id, updates);
      if (response.success) {
        toast.success('Usuario actualizado exitosamente');
        handleCloseUserModal();
        loadUsers();
      }
    } catch (error: any) {
      toast.error(`Error al actualizar usuario: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCloseUserModal = () => {
        setEditingUser(null);
    setIsCreatingUser(false);
        setEditUsername('');
        setEditEmail('');
        setEditPassword('');
        setEditSubscriptionType('');
        setEditDurationDays(null);
    setEditStartDate('');
    setEditEndDate('');
  };

  // Generate username from email
  const generateUsernameFromEmail = (email: string): string => {
    if (!email || !email.includes('@')) return '';
    return email.split('@')[0].trim();
  };

  // Handle email change - auto-generate username when creating
  const handleEmailChange = (email: string) => {
    setEditEmail(email);
    // Auto-generate username from email when creating new user
    if (isCreatingUser && email.includes('@')) {
      const generatedUsername = generateUsernameFromEmail(email);
      if (generatedUsername && !editUsername) {
        setEditUsername(generatedUsername);
      }
    }
  };

  const getSubscriptionIcon = (type: string) => {
    switch (type) {
      case 'administrador': return <Crown className="text-yellow-600" size={20} />;
      case 'pro': return <Zap className="text-blue-600" size={20} />;
      case 'elite': return <TrendingUp className="text-purple-600" size={20} />;
      default: return <Gift className="text-green-600" size={20} />;
    }
  };

  const getSubscriptionColor = (type: string) => {
    switch (type) {
      case 'administrador': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'pro': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'elite': return 'bg-purple-100 text-purple-800 border-purple-300';
      default: return 'bg-green-100 text-green-800 border-green-300';
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  const isSubscriptionExpired = (endDate?: string) => {
    if (!endDate) return false;
    return new Date(endDate) < new Date();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Gestión de Usuarios</h2>
          <p className="text-slate-500">Administra usuarios y suscripciones</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowBulkCreator(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Upload size={18} />
            Crear por Volumen
          </button>
          <button
            onClick={handleOpenCreateUser}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus size={18} />
            Crear Usuario
          </button>
        </div>
      </div>

      {/* Subscription Limits Info */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-slate-800">Límites de Suscripción</h3>
          <div className="text-xs text-slate-500">
            💡 Haz clic en los íconos para editar límites (azul) o enlaces de contacto (verde)
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {subscriptionLimits.map((limit) => {
            const contactLink = contactLinks.find(l => l.subscriptionType === limit.type);
            return (
              <div key={limit.type} className="border border-slate-200 rounded-lg p-4 relative">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {getSubscriptionIcon(limit.type)}
                    <span className="font-semibold capitalize">{limit.type}</span>
                  </div>
                  {limit.type !== 'administrador' && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleEditLimit(limit)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors border border-blue-200"
                        title="Editar límites (mensajes, duración, precio)"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleEditContactLink(limit)}
                        className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors border border-green-200"
                        title="Editar enlace de contacto para el modal de suscripción"
                      >
                        <MessageCircle size={16} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="text-sm text-slate-600">
                  <div>Mensajes: {limit.messages === Infinity || limit.messages === null || limit.messages === undefined ? 'Ilimitados' : limit.messages.toLocaleString()}</div>
                  <div>Duración: {limit.duration ? `${limit.duration} día(s)` : 'Permanente'}</div>
                  <div>Precio: ${limit.price || 0} USD/mes</div>
                  {contactLink && (
                    <div className="mt-2 pt-2 border-t border-slate-200 text-xs">
                      <div className="text-slate-500">Contacto:</div>
                      <div className="font-medium">
                        {contactLink.contactType === 'whatsapp_number' && '📱 WhatsApp'}
                        {contactLink.contactType === 'wa_link' && '🔗 Wa.link'}
                        {contactLink.contactType === 'payment_link' && '💳 Enlace de pago'}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-6 border-b border-slate-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
              <Users size={18} />
              Usuarios ({filteredAndSortedUsers.length} de {users.length})
            </h3>
            {selectedUsers.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600">{selectedUsers.size} seleccionado(s)</span>
                <button
                  onClick={() => setShowBulkEditModal(true)}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm flex items-center gap-1"
                >
                  <Edit2 size={14} />
                  Editar Masivamente
                </button>
                <button
                  onClick={handleDeleteBulk}
                  className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm flex items-center gap-1"
                >
                  <Trash2 size={14} />
                  Eliminar Seleccionados
                </button>
              </div>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Buscar por nombre, email o tipo de suscripción..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="text-center py-8 text-slate-400">
              <div className="w-8 h-8 border-2 border-slate-300 border-t-green-600 rounded-full animate-spin mx-auto mb-2"></div>
              <p>Cargando usuarios...</p>
            </div>
          ) : filteredAndSortedUsers.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Users size={48} className="mx-auto mb-2 opacity-20" />
              <p>{searchQuery ? 'No se encontraron usuarios' : 'No hay usuarios registrados'}</p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedUsers.size === filteredAndSortedUsers.length && filteredAndSortedUsers.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-slate-300 text-green-600 focus:ring-green-500"
                    />
                  </th>
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort('username')}
                  >
                    <div className="flex items-center gap-1">
                      Usuario
                      <SortIcon field="username" />
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort('email')}
                  >
                    <div className="flex items-center gap-1">
                      Email
                      <SortIcon field="email" />
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort('subscription_type')}
                  >
                    <div className="flex items-center gap-1">
                      Suscripción
                      <SortIcon field="subscription_type" />
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort('subscription_start_date')}
                  >
                    <div className="flex items-center gap-1">
                      Inicio
                      <SortIcon field="subscription_start_date" />
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort('subscription_end_date')}
                  >
                    <div className="flex items-center gap-1">
                      Fin
                      <SortIcon field="subscription_end_date" />
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAndSortedUsers.map((user) => {
                  const isExpired = isSubscriptionExpired(user.subscription_end_date);
                  const isSelected = selectedUsers.has(user.id);
                  return (
                    <tr 
                      key={user.id} 
                      className={`hover:bg-slate-50 transition-colors ${isSelected ? 'bg-blue-50' : ''} ${isExpired ? 'bg-red-50' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleSelectUser(user.id, e.target.checked)}
                          className="rounded border-slate-300 text-green-600 focus:ring-green-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {getSubscriptionIcon(user.subscription_type)}
                          <span className="font-medium text-slate-800">{user.username}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {user.email || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full border font-medium ${getSubscriptionColor(user.subscription_type)}`}>
                          {user.subscription_type.toUpperCase()}
                        </span>
                        {isExpired && (
                          <span className="ml-2 text-xs px-2 py-1 rounded-full bg-red-100 text-red-800 border border-red-300">
                            EXPIRADA
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {formatDate(user.subscription_start_date)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {user.subscription_end_date ? formatDate(user.subscription_end_date) : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEditUser(user)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Editar usuario"
                          >
                            <Edit2 size={14} />
                          </button>
                          {user.username !== 'admin' && (
                            <button
                              onClick={() => handleDeleteUser(user.id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Eliminar usuario"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>

      {/* Edit/Create User Modal */}
      {(editingUser || isCreatingUser) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold text-slate-800 mb-4">
              {isCreatingUser ? 'Crear Nuevo Usuario' : `Editar Usuario - ${editingUser?.username}`}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Nombre de Usuario {isCreatingUser && '(Generado automáticamente)'}
                </label>
                <input
                  type="text"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  placeholder={isCreatingUser ? "Se generará desde el correo" : "usuario123 (opcional)"}
                />
                <p className="text-xs text-slate-500 mt-1">
                  {isCreatingUser 
                    ? 'Se genera automáticamente desde el correo electrónico' 
                    : 'Opcional - dejar vacío para mantener el actual'}
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Email {isCreatingUser && '*'}
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  placeholder="usuario@ejemplo.com"
                  required={isCreatingUser}
                />
                {isCreatingUser && (
                  <p className="text-xs text-slate-500 mt-1">Campo obligatorio - El nombre de usuario se generará automáticamente</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {isCreatingUser ? 'Contraseña' : 'Nueva Contraseña'}
                </label>
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  placeholder={isCreatingUser ? "Opcional - se usará una por defecto" : "Dejar vacío para no cambiar"}
                />
                <p className="text-xs text-slate-500 mt-1">
                  {isCreatingUser 
                    ? 'Opcional - Si se deja vacío se usará una contraseña por defecto' 
                    : 'Dejar vacío para mantener la contraseña actual'}
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Tipo de Suscripción
                </label>
                <select
                  value={editSubscriptionType}
                  onChange={(e) => setEditSubscriptionType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
                >
                  <option value="gratuito">Gratuito</option>
                  <option value="pro">Pro</option>
                  <option value="elite">Elite</option>
                  <option value="administrador">Administrador</option>
                </select>
              </div>
              
              {/* Fecha de Inicio */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Fecha de Inicio de Suscripción
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={editStartDate}
                    onChange={(e) => setEditStartDate(e.target.value)}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg"
                  />
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleStartDateIncrement(1)}
                      className="px-2 py-2 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                      title="Calcular fin: Inicio + 1 mes"
                    >
                      +1M
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartDateIncrement(3)}
                      className="px-2 py-2 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                      title="Calcular fin: Inicio + 3 meses"
                    >
                      +3M
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartDateIncrement(6)}
                      className="px-2 py-2 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                      title="Calcular fin: Inicio + 6 meses"
                    >
                      +6M
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartDateIncrement(9)}
                      className="px-2 py-2 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                      title="Calcular fin: Inicio + 9 meses"
                    >
                      +9M
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-1">Los botones calculan la fecha de fin basándose en la fecha de inicio</p>
              </div>

              {/* Fecha de Fin */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Fecha de Fin de Suscripción
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={editEndDate}
                    onChange={(e) => setEditEndDate(e.target.value)}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg"
                  />
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleEndDateIncrement(1)}
                      className="px-2 py-2 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                      title="Incrementar fin +1 mes"
                    >
                      +1M
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEndDateIncrement(3)}
                      className="px-2 py-2 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                      title="Incrementar fin +3 meses"
                    >
                      +3M
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEndDateIncrement(6)}
                      className="px-2 py-2 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                      title="Incrementar fin +6 meses"
                    >
                      +6M
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEndDateIncrement(9)}
                      className="px-2 py-2 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                      title="Incrementar fin +9 meses"
                    >
                      +9M
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-1">Los botones incrementan la fecha de fin</p>
              </div>
            </div>
            
            <div className="flex gap-2 mt-6">
              <button
                onClick={handleCloseUserModal}
                disabled={isSaving}
                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveUser}
                disabled={isSaving}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {isCreatingUser ? 'Creando...' : 'Guardando...'}
                  </>
                ) : (
                  isCreatingUser ? 'Crear' : 'Guardar'
                )}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Edit Contact Link Modal */}
      {editingContactLink && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-slate-800">
                Editar Enlace de Contacto - {editingContactLink.type.toUpperCase()}
              </h3>
              <button
                onClick={() => {
                  setEditingContactLink(null);
                  setLinkContactType('whatsapp_number');
                  setLinkContactValue('');
                }}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Tipo de Contacto
                </label>
                <select
                  value={linkContactType}
                  onChange={(e) => setLinkContactType(e.target.value as 'whatsapp_number' | 'wa_link' | 'payment_link')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                >
                  <option value="whatsapp_number">Número de WhatsApp</option>
                  <option value="wa_link">Enlace Wa.link</option>
                  <option value="payment_link">Enlace de Pago</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {linkContactType === 'whatsapp_number' && 'Número de WhatsApp (ej: 51977638887)'}
                  {linkContactType === 'wa_link' && 'URL de Wa.link (ej: https://wa.link/xxxxx)'}
                  {linkContactType === 'payment_link' && 'URL de Enlace de Pago (ej: https://paypal.me/...)'}
                </label>
                <input
                  type="text"
                  value={linkContactValue}
                  onChange={(e) => setLinkContactValue(e.target.value)}
                  placeholder={
                    linkContactType === 'whatsapp_number' ? '51977638887' :
                    linkContactType === 'wa_link' ? 'https://wa.link/xxxxx' :
                    'https://...'
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleSaveContactLink}
                  className="flex-1 bg-green-600 text-white py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors"
                >
                  Guardar
                </button>
                <button
                  onClick={() => {
                    setEditingContactLink(null);
                    setLinkContactType('whatsapp_number');
                    setLinkContactValue('');
                  }}
                  className="flex-1 bg-slate-200 text-slate-700 py-2 rounded-lg font-semibold hover:bg-slate-300 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Limit Modal */}
      {editingLimit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full mx-4">
            <h3 className="font-semibold text-slate-800 mb-4">
              Editar Límites - {editingLimit.type.charAt(0).toUpperCase() + editingLimit.type.slice(1)}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Mensajes por mes
                </label>
                <input
                  type="number"
                  value={limitMessages === 0 && editingLimit.type === 'administrador' ? '' : limitMessages}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0;
                    setLimitMessages(val);
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  placeholder={editingLimit.type === 'administrador' ? 'Ilimitados' : '0'}
                  disabled={editingLimit.type === 'administrador'}
                />
                {editingLimit.type === 'administrador' && (
                  <p className="text-xs text-slate-500 mt-1">Los administradores tienen mensajes ilimitados</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Duración (días)
                </label>
                <input
                  type="number"
                  value={limitDuration || ''}
                  onChange={(e) => setLimitDuration(parseInt(e.target.value) || null)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  placeholder="30"
                />
                <p className="text-xs text-slate-500 mt-1">Dejar vacío para permanente</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Precio (USD/mes)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  placeholder="0.00"
                />
              </div>
            </div>
            
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => {
                  setEditingLimit(null);
                  setLimitMessages(0);
                  setLimitDuration(null);
                  setLimitPrice(0);
                }}
                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveLimit}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Edit Modal */}
      {showBulkEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full mx-4">
            <h3 className="font-semibold text-slate-800 mb-4">
              Editar {selectedUsers.size} Usuario(s) Masivamente
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Tipo de Suscripción (opcional)
                </label>
                <select
                  value={bulkSubscriptionType}
                  onChange={(e) => setBulkSubscriptionType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                >
                  <option value="">No cambiar</option>
                  <option value="gratuito">Gratuito</option>
                  <option value="pro">Pro</option>
                  <option value="elite">Elite</option>
                  <option value="administrador">Administrador</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Nueva Contraseña (opcional)
                </label>
                <input
                  type="password"
                  value={bulkPassword}
                  onChange={(e) => setBulkPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  placeholder="2748curso (por defecto si se deja vacío)"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Si se deja vacío, se usará la contraseña por defecto: 2748curso
                </p>
              </div>
            </div>
            
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => {
                  setShowBulkEditModal(false);
                  setBulkSubscriptionType('');
                  setBulkPassword('');
                }}
                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleBulkUpdate}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Actualizar {selectedUsers.size} Usuario(s)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk User Creator Modal */}
      {showBulkCreator && (
        <BulkUserCreator
          isOpen={showBulkCreator}
          onClose={() => setShowBulkCreator(false)}
          onSuccess={loadUsers}
          toast={toast}
          subscriptionLimits={subscriptionLimits}
        />
      )}

      {/* Delete User Confirmation Modal with Loader */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Eliminar Usuario</h3>
            <p className="text-slate-600 mb-6">
              ¿Estás seguro de que deseas eliminar este usuario? Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setUserToDelete(null);
                }}
                disabled={isDeleting}
                className="px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDeleteUser}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Eliminando...
                  </>
                ) : (
                  'Eliminar'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal with Progress */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">
              {deleteProgress.isDeleting ? 'Eliminando Usuarios...' : 'Eliminar Usuarios'}
            </h3>
            
            {deleteProgress.isDeleting ? (
              <div className="space-y-4">
                <p className="text-slate-600">
                  Eliminando {deleteProgress.current} de {deleteProgress.total} usuarios...
                </p>
                <div className="w-full bg-slate-200 rounded-full h-3">
                  <div 
                    className="bg-red-600 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${(deleteProgress.current / deleteProgress.total) * 100}%` }}
                  />
                </div>
                <p className="text-sm text-slate-500 text-center">
                  {Math.round((deleteProgress.current / deleteProgress.total) * 100)}% completado
                </p>
              </div>
            ) : (
              <>
                <p className="text-slate-600 mb-6">
                  ¿Estás seguro de que deseas eliminar {selectedUsers.size} usuario(s)? Esta acción no se puede deshacer.
                </p>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setShowBulkDeleteModal(false)}
                    className="px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmDeleteBulk}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Eliminar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

