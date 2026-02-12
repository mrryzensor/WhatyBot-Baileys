import React, { useState, useEffect, useRef } from 'react';
import { Users, RefreshCw, Send, Search, Save, FolderOpen, Eye, X, UserCheck } from 'lucide-react';
import { Group, MessageLog, GroupSelection, ScheduledMessage } from '../types';
import { getGroups, sendGroupMessages, scheduleGroupMessages } from '../services/api';
import { GroupSelectionManager } from './GroupSelectionManager';
import { ScheduleManager } from './ScheduleManager';
import { MessagePreview } from './MessagePreview';
import { MediaUpload } from './MediaUpload';
import { MessageEditorToolbar } from './MessageEditorToolbar';
import { SubscriptionUpgradeModal } from './SubscriptionUpgradeModal';
import { GroupMembersViewer } from './GroupMembersViewer';
import { PollCreator } from './PollCreator';
import { GroupIcon } from './GroupIcon';
import { BulkProgressBar } from './BulkProgressBar';
import { useSchedule } from '../hooks/useSchedule';
import { useMedia } from '../hooks/useMedia';
import { getSubscriptionLimits } from '../services/usersApi';
import { getCurrentUser as getAuthUser } from '../services/authApi';

interface GroupManagerProps {
  isConnected: boolean;
  addLog: (log: MessageLog) => void;
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    warning: (message: string) => void;
    info: (message: string) => void;
  };
  onNavigate?: (tab: string) => void;
  initialGroups?: Group[];
  onGroupsUpdate?: (groups: Group[]) => void;
}

export const GroupManager: React.FC<GroupManagerProps> = ({ isConnected, addLog, toast, onNavigate, initialGroups, onGroupsUpdate }) => {
  const [groups, setGroups] = useState<Group[]>(initialGroups || []);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const media = useMedia({ maxFiles: 50 });
  const messageTextareaRef = useRef<HTMLTextAreaElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [showOnlyAllowedGroups, setShowOnlyAllowedGroups] = useState(true);
  const [showOnlyAdminGroups, setShowOnlyAdminGroups] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'participants'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showPreview, setShowPreview] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [subscriptionLimits, setSubscriptionLimits] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [limitError, setLimitError] = useState<any>(null);
  const [viewingGroupId, setViewingGroupId] = useState<string | null>(null);
  const [viewingGroupName, setViewingGroupName] = useState<string>('');
  const [showMembersViewer, setShowMembersViewer] = useState(false);
  const [activeTab, setActiveTab] = useState<'message' | 'poll'>('message');

  const isAdmin = (currentUser?.subscription_type || '').toString().toLowerCase() === 'administrador';

  const schedule = useSchedule();

  React.useEffect(() => {
    loadUserInfo();
  }, []);


  const loadUserInfo = async () => {
    try {
      const user = getAuthUser();
      setCurrentUser(user);

      const limitsResponse = await getSubscriptionLimits();
      if (limitsResponse.success) {
        setSubscriptionLimits(limitsResponse.limits);
      }
    } catch (error) {
      console.error('Error loading user info:', error);
    }
  };

  // Load groups on mount if connected
  useEffect(() => {
    if (isConnected) {
      extractGroups();
    }
  }, [isConnected]);

  useEffect(() => {
    if (initialGroups && initialGroups.length > 0 && groups.length === 0) {
      setGroups(initialGroups);
    }
  }, [initialGroups, groups.length]);

  // Extract groups from WhatsApp via backend API
  const extractGroups = async () => {
    setLoading(true);
    try {
      const response = await getGroups();
      if (response.success) {
        setGroups(response.groups);
        if (onGroupsUpdate) {
          onGroupsUpdate(response.groups);
        }
      }
    } catch (error) {
      console.error('Error extracting groups:', error);
      toast.error('Error al extraer grupos. Asegúrate de que el backend esté conectado.');
    } finally {
      setLoading(false);
    }
  };

  const toggleGroup = (id: string) => {
    const newSelected = new Set(selectedGroups);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedGroups(newSelected);
  };

  const handleSendToGroups = async () => {
    if (!message && media.mediaItems.length === 0) {
      toast.error("Por favor ingresa un mensaje o selecciona un archivo multimedia");
      return;
    }
    if (selectedGroups.size === 0) {
      toast.error("Selecciona al menos un grupo");
      return;
    }

    // Validate schedule using the unified hook
    if (!schedule.validateSchedule(toast)) {
      return;
    }

    // Send directly without confirmation modal
    await handleSending();
  };

  const handleSending = async () => {
    setLoading(true);

    try {
      const groupIds = Array.from(selectedGroups) as string[];
      const files = media.mediaItems
        .map((item) => item.file)
        .filter((f): f is File => !!f);
      const captions = media.mediaItems.map((item) => item.caption || '');

      if (schedule.scheduleType === 'now') {
        const response = await sendGroupMessages(groupIds, message, files, captions);

        if (response.success) {
          const targets = groups.filter(g => selectedGroups.has(g.id));
          for (const group of targets) {
            addLog({
              id: `g-msg-${Date.now()}-${group.id}`,
              target: group.name,
              status: 'sent',
              timestamp: new Date(),
              content: message || '[Archivo multimedia]'
            });
          }

          toast.success(`¡Mensaje enviado a ${targets.length} grupos!`);
          setMessage('');
          media.clearAll();
          setSelectedGroups(new Set());
          schedule.reset();
        }
      } else {
        const response = await scheduleGroupMessages(
          groupIds,
          message,
          schedule.scheduleType,
          schedule.delayMinutes,
          schedule.scheduledAt,
          files,
          captions
        );

        if (response.success) {
          // Save scheduled message to localStorage
          const scheduledMessage: ScheduledMessage = {
            id: response.jobId,
            type: 'groups',
            recipients: groupIds,
            message: message || '[Archivo multimedia]',
            scheduleType: schedule.scheduleType,
            delayMinutes: schedule.delayMinutes,
            scheduledAt: schedule.scheduledAt ? new Date(schedule.scheduledAt) : undefined,
            status: 'scheduled',
            createdAt: new Date(),
            file: files.length > 0 ? files[0] : undefined,
            variables: []
          };

          // Load existing scheduled messages
          const existing = localStorage.getItem('scheduledMessages');
          const scheduledMessages = existing ? JSON.parse(existing) : [];
          // Convert dates to ISO strings for storage
          const messageToSave = {
            ...scheduledMessage,
            scheduledAt: scheduledMessage.scheduledAt?.toISOString(),
            createdAt: scheduledMessage.createdAt.toISOString()
          };
          scheduledMessages.push(messageToSave);
          localStorage.setItem('scheduledMessages', JSON.stringify(scheduledMessages));

          toast.success(`¡Mensaje programado para ${selectedGroups.size} grupos!`);
          setMessage('');
          media.clearAll();
          setSelectedGroups(new Set());
          schedule.reset();

          // Navigate to scheduled messages tab
          if (onNavigate) {
            setTimeout(() => onNavigate('scheduled'), 1000);
          }
        }
      }
    } catch (error: any) {
      console.error('Error sending to groups:', error);

      // Check if error is due to limit exceeded
      if (
        error.response?.status === 403 &&
        (error.response?.data?.limitExceeded || error.response?.data?.subscriptionExpired) &&
        !isAdmin
      ) {
        setLimitError(error.response.data);
        setShowUpgradeModal(true);
      } else {
        toast.error(`Error al ${schedule.scheduleType === 'now' ? 'enviar' : 'programar'} mensajes: ${error.message || 'Error desconocido'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const filteredGroups = groups.filter((g) => {
    const matchesName = g.name.toLowerCase().includes(filter.toLowerCase());
    const matchesPermission = !showOnlyAllowedGroups || g.canSend !== false;
    const matchesAdmin = !showOnlyAdminGroups || g.isAdmin === true;
    return matchesName && matchesPermission && matchesAdmin;
  });

  const sortedGroups = [...filteredGroups].sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'participants') {
      cmp = (a.participants || 0) - (b.participants || 0);
    } else {
      cmp = (a.name || '').localeCompare((b.name || ''), 'es', { sensitivity: 'base' });
    }
    return sortDirection === 'asc' ? cmp : -cmp;
  });

  const allowedGroupsCount = groups.filter((g) => g.canSend !== false).length;
  const visibleGroupIds = sortedGroups.map((g) => g.id);
  const selectedVisibleCount = visibleGroupIds.filter((id) => selectedGroups.has(id)).length;
  const allVisibleSelected = visibleGroupIds.length > 0 && selectedVisibleCount === visibleGroupIds.length;
  const anyVisibleSelected = selectedVisibleCount > 0;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = anyVisibleSelected && !allVisibleSelected;
    }
  }, [anyVisibleSelected, allVisibleSelected, visibleGroupIds.length]);

  const toggleSelectAllVisible = () => {
    const next = new Set(selectedGroups);
    if (allVisibleSelected) {
      visibleGroupIds.forEach((id) => next.delete(id));
    } else {
      visibleGroupIds.forEach((id) => next.add(id));
    }
    setSelectedGroups(next);
  };

  const handleViewMembers = (groupId: string, groupName: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent group selection when clicking the button
    setViewingGroupId(groupId);
    setViewingGroupName(groupName);
    setShowMembersViewer(true);
  };

  const handleMembersSelect = (selectedMembers: any[]) => {
    // This callback is called when members are selected
    // The actual transfer to MassSender is handled in GroupMembersViewer
    // This is kept for potential future use or logging
  };

  return (
    <>
      {/* Media Upload Progress Bar */}
      {media.uploadProgress && (
        <BulkProgressBar
          current={media.uploadProgress.current}
          total={media.uploadProgress.total}
          isActive={true}
          title="Subiendo archivos..."
          subtitle="Procesando archivos multimedia"
        />
      )}

      {showUpgradeModal && currentUser && limitError && (
        <SubscriptionUpgradeModal
          isOpen={showUpgradeModal}
          onClose={() => {
            setShowUpgradeModal(false);
            setLimitError(null);
          }}
          currentPlan={currentUser.subscription_type}
          currentLimit={limitError.limit || 0}
          currentUsed={limitError.currentCount || 0}
          subscriptionExpired={!!limitError.subscriptionExpired}
          subscriptionEndDate={limitError.endDate}
          subscriptionLimits={subscriptionLimits}
          userEmail={currentUser.email || ''}
          isConnected={isConnected}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-8rem)]">

        {/* Group List */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-theme-card rounded-xl shadow-sm border border-theme flex flex-col overflow-hidden">
            <div className="p-4 border-b border-theme flex justify-between items-center bg-theme-base">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-theme-main">Grupos Disponibles</h3>
                <span className="bg-primary-100 text-primary-700 text-xs px-2 py-0.5 rounded-full">{groups.length}</span>
              </div>
              <button
                onClick={extractGroups}
                disabled={!isConnected || loading}
                className="text-sm flex items-center gap-2 text-blue-600 hover:text-blue-700 disabled:opacity-50"
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                {loading ? 'Extrayendo...' : 'Escanear Grupos'}
              </button>
            </div>

            {/* Search */}
            <div className="p-2 border-b border-theme">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar grupos..."
                  className="w-full pl-9 pr-4 py-2 text-sm border border-theme rounded-lg focus:outline-none focus:border-primary-500"
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                />
              </div>

              {/* Filters */}
              <div className="p-3 border-b border-theme space-y-3">
                {/* Allowed Groups Filter */}
                <div className="flex items-center justify-between gap-2 p-2.5 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-xs font-medium text-theme-main truncate">Solo grupos permitidos</span>
                    <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">{allowedGroupsCount}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowOnlyAllowedGroups((v) => !v)}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${showOnlyAllowedGroups ? 'bg-primary-600' : 'bg-slate-300'}`}
                    aria-pressed={showOnlyAllowedGroups}
                    aria-label="Solo grupos permitidos para enviar"
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-theme-card transition-transform ${showOnlyAllowedGroups ? 'translate-x-4' : 'translate-x-0.5'}`}
                    />
                  </button>
                </div>

                {/* Admin Filter and Sort */}
                <div className="grid grid-cols-2 gap-2">
                  {/* Admin Filter */}
                  <div className="flex items-center justify-between gap-2 p-2.5 bg-theme-base rounded-lg border border-theme">
                    <span className="text-xs font-medium text-theme-main truncate">Soy admin</span>
                    <button
                      type="button"
                      onClick={() => setShowOnlyAdminGroups((v) => !v)}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${showOnlyAdminGroups ? 'bg-primary-600' : 'bg-slate-300'}`}
                      aria-pressed={showOnlyAdminGroups}
                      aria-label="Solo donde soy admin"
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-theme-card transition-transform ${showOnlyAdminGroups ? 'translate-x-4' : 'translate-x-0.5'}`}
                      />
                    </button>
                  </div>

                  {/* Sort Options */}
                  <div className="flex items-center gap-1.5 p-2.5 bg-theme-base rounded-lg border border-theme">
                    <select
                      className="flex-1 text-xs font-medium text-theme-main bg-transparent focus:outline-none min-w-0"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as 'name' | 'participants')}
                      aria-label="Ordenar grupos"
                    >
                      <option value="name">Nombre</option>
                      <option value="participants">Participantes</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
                      className="text-xs font-semibold text-theme-muted hover:text-theme-main px-1.5 py-0.5 bg-theme-card rounded border border-theme flex-shrink-0"
                      aria-label="Cambiar dirección de orden"
                    >
                      {sortDirection === 'asc' ? '↑' : '↓'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-80">
              {groups.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <Users size={48} className="mb-2 opacity-20" />
                  <p>No se encontraron grupos. Haz clic en "Escanear Grupos".</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between px-3 py-2 border border-theme rounded-lg bg-theme-card sticky top-0 z-10">
                    <label
                      className="flex items-center gap-2 text-xs text-theme-main select-none"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAllVisible}
                        className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                      />
                      {allVisibleSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
                    </label>
                    <span className="text-xs text-theme-muted">{selectedVisibleCount}/{visibleGroupIds.length}</span>
                  </div>

                  {sortedGroups.map(group => (
                    <div
                      key={group.id}
                      onClick={() => toggleGroup(group.id)}
                      className={`flex items-center gap-4 p-3 rounded-lg cursor-pointer transition-colors ${selectedGroups.has(group.id) ? 'bg-primary-50 border border-primary-200' : 'hover:bg-theme-base border border-transparent'
                        }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedGroups.has(group.id)}
                        readOnly
                        className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                      />
                      <GroupIcon
                        image={group.image}
                        name={group.name}
                        size={40}
                        className="flex-shrink-0"
                      />
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-theme-main">{group.name}</h4>
                        <p className="text-xs text-theme-muted">{group.participants} participantes</p>
                      </div>
                      <button
                        onClick={(e) => handleViewMembers(group.id, group.name, e)}
                        className="p-2 hover:bg-primary-100 rounded-lg transition-colors text-primary-600 hover:text-primary-700"
                        title="Ver miembros del grupo"
                      >
                        <UserCheck size={18} />
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Group Selection Manager */}
          <GroupSelectionManager
            groups={groups}
            selectedGroups={selectedGroups}
            onSelectionLoad={(groupIds) => setSelectedGroups(new Set(groupIds))}
            onSelectionChange={(groupIds) => setSelectedGroups(new Set(groupIds))}
            toast={toast}
          />
        </div>

        {/* Message/Poll Area */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Tabs for Message/Poll */}
          <div className="flex bg-slate-100 p-1 rounded-xl self-start">
            <button
              onClick={() => setActiveTab('message')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'message'
                ? 'bg-theme-card text-primary-700 shadow-sm'
                : 'text-theme-muted hover:text-theme-main'
                }`}
            >
              Mensaje
            </button>
            <button
              onClick={() => setActiveTab('poll')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'poll'
                ? 'bg-theme-card text-primary-700 shadow-sm'
                : 'text-theme-muted hover:text-theme-main'
                }`}
            >
              Encuesta
            </button>
          </div>

          {activeTab === 'message' ? (
            <>
              <ScheduleManager
                scheduleType={schedule.scheduleType}
                delayMinutes={schedule.delayMinutes}
                scheduledAt={schedule.scheduledAt}
                scheduledDate={schedule.scheduledDate}
                scheduledTime={schedule.scheduledTime}
                onScheduleChange={schedule.updateSchedule}
                onDateChange={(date) => {
                  schedule.setScheduledDate(date);
                  schedule.handleDateTimeChange(date, schedule.scheduledTime);
                }}
                onTimeChange={(time) => {
                  schedule.setScheduledTime(time);
                  schedule.handleDateTimeChange(schedule.scheduledDate, time);
                }}
                disabled={loading}
              />

              <div className="bg-theme-card p-6 rounded-xl shadow-sm border border-theme flex-1 flex flex-col">
                <h3 className="font-semibold text-theme-main mb-4">Mensaje de Difusión</h3>
                {/* Message Editor Toolbar */}
                <MessageEditorToolbar
                  textareaRef={messageTextareaRef}
                  value={message}
                  onChange={setMessage}
                  showVariables={false}
                />
                <textarea
                  ref={messageTextareaRef}
                  className="flex-1 w-full p-4 border border-theme rounded-lg resize-none mb-4 mt-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Escribe tu mensaje para los grupos seleccionados..."
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                ></textarea>

                {/* Media Upload */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-theme-main mb-2">
                    Archivos Adjuntos (opcional)
                  </label>
                  <MediaUpload
                    mediaItems={media.mediaItems}
                    onMediaChange={media.setMediaItems}
                    maxFiles={50}
                    fileInputRef={media.fileInputRef}
                    onFileSelect={media.handleFileSelect}
                    onDrop={media.handleDrop}
                    onOpenFileSelector={media.openFileSelector}
                    onRemoveMedia={media.removeMedia}
                    onUpdateCaption={media.updateCaption}
                  />
                </div>

                {/* Inline Preview */}
                {message && (
                  <div className="mb-4">
                    <MessagePreview
                      message={message}
                      contactName="Grupo de Ejemplo"
                      showContactInfo={false}
                      inline={true}
                    />
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <div className="text-sm text-theme-muted">
                    Seleccionados: <span className="font-bold text-theme-main">{selectedGroups.size}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowPreview(true)}
                      disabled={!message && media.mediaItems.length === 0}
                      className={`flex items-center gap-2 px-4 py-3 rounded-lg font-medium transition-all ${!message && media.mediaItems.length === 0
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                    >
                      <Eye size={18} />
                      Vista Previa
                    </button>
                    <button
                      onClick={handleSendToGroups}
                      disabled={!isConnected || selectedGroups.size === 0 || loading || (!message && media.mediaItems.length === 0)}
                      className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-lg font-medium shadow-lg shadow-primary-900/10 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          {schedule.scheduleType === 'now' ? 'Enviando...' : 'Programando...'}
                        </>
                      ) : (
                        <>
                          <Send size={18} /> {schedule.scheduleType === 'now' ? 'Enviar Difusión' : 'Programar Difusión'}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <PollCreator
              selectedGroupsCount={selectedGroups.size}
              selectedGroupIds={selectedGroups}
              isConnected={isConnected}
              onSendComplete={() => setSelectedGroups(new Set())}
              toast={toast}
            />
          )}
        </div>

        {/* Message Preview Modal */}
        {showPreview && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-theme-card rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
              <div className="flex justify-between items-center p-4 border-b border-theme">
                <h3 className="text-lg font-semibold text-theme-main">Vista Previa del Mensaje</h3>
                <button
                  onClick={() => setShowPreview(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X size={20} className="text-theme-muted" />
                </button>
              </div>
              <div className="p-4 overflow-y-auto">
                <MessagePreview
                  message={message}
                  contactName="Grupo de Ejemplo"
                  showContactInfo={false}
                />
              </div>
            </div>
          </div>
        )}

        {/* Group Members Viewer Modal */}
        {viewingGroupId && (
          <GroupMembersViewer
            groupId={viewingGroupId}
            groupName={viewingGroupName}
            isOpen={showMembersViewer}
            onClose={() => {
              setShowMembersViewer(false);
              setViewingGroupId(null);
              setViewingGroupName('');
            }}
            onMembersSelect={handleMembersSelect}
            toast={toast}
            onNavigate={onNavigate}
          />
        )}


      </div>
    </>
  );
};