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
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [subscriptionLimits, setSubscriptionLimits] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [limitError, setLimitError] = useState<any>(null);
  const [viewingGroupId, setViewingGroupId] = useState<string | null>(null);
  const [viewingGroupName, setViewingGroupName] = useState<string>('');
  const [showMembersViewer, setShowMembersViewer] = useState(false);

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
      if (error.response?.status === 403 && error.response?.data?.limitExceeded && currentUser?.subscription_type !== 'administrador') {
        setLimitError(error.response.data);
        setShowUpgradeModal(true);
      } else {
        toast.error(`Error al ${schedule.scheduleType === 'now' ? 'enviar' : 'programar'} mensajes: ${error.message || 'Error desconocido'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const filteredGroups = groups.filter(g => g.name.toLowerCase().includes(filter.toLowerCase()));

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
          subscriptionLimits={subscriptionLimits}
          userEmail={currentUser.email || ''}
          isConnected={isConnected}
        />
      )}
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-8rem)]">

      {/* Group List */}
      <div className="lg:col-span-1 space-y-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-800">Grupos Disponibles</h3>
              <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">{groups.length}</span>
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
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar grupos..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-green-500"
                value={filter}
                onChange={e => setFilter(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-80">
            {groups.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <Users size={48} className="mb-2 opacity-20" />
                <p>No se encontraron grupos. Haz clic en "Escanear Grupos".</p>
              </div>
            ) : (
              filteredGroups.map(group => (
                <div
                  key={group.id}
                  onClick={() => toggleGroup(group.id)}
                  className={`flex items-center gap-4 p-3 rounded-lg cursor-pointer transition-colors ${selectedGroups.has(group.id) ? 'bg-green-50 border border-green-200' : 'hover:bg-slate-50 border border-transparent'
                    }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedGroups.has(group.id)}
                    readOnly
                    className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                  />
                  <GroupIcon 
                    image={group.image} 
                    name={group.name}
                    size={40}
                    className="flex-shrink-0"
                  />
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-slate-800">{group.name}</h4>
                    <p className="text-xs text-slate-500">{group.participants} participantes</p>
                  </div>
                  <button
                    onClick={(e) => handleViewMembers(group.id, group.name, e)}
                    className="p-2 hover:bg-green-100 rounded-lg transition-colors text-green-600 hover:text-green-700"
                    title="Ver miembros del grupo"
                  >
                    <UserCheck size={18} />
                  </button>
                </div>
              ))
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

      {/* Message Sender for Groups */}
      <div className="lg:col-span-2 flex flex-col gap-4">
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
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex-1 flex flex-col">
          <h3 className="font-semibold text-slate-800 mb-4">Mensaje de Difusión</h3>
          {/* Message Editor Toolbar */}
          <MessageEditorToolbar
            textareaRef={messageTextareaRef}
            value={message}
            onChange={setMessage}
            showVariables={false}
          />
          <textarea
            ref={messageTextareaRef}
            className="flex-1 w-full p-4 border border-slate-200 rounded-lg resize-none mb-4 mt-2 focus:ring-2 focus:ring-green-500 focus:border-transparent"
            placeholder="Escribe tu mensaje para los grupos seleccionados..."
            value={message}
            onChange={e => setMessage(e.target.value)}
          ></textarea>

          {/* Media Upload */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
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
            <div className="text-sm text-slate-500">
              Seleccionados: <span className="font-bold text-slate-800">{selectedGroups.size}</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowPreview(true)}
                disabled={!message && media.mediaItems.length === 0}
                className={`flex items-center gap-2 px-4 py-3 rounded-lg font-medium transition-all ${
                  !message && media.mediaItems.length === 0
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
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium shadow-lg shadow-green-900/10 disabled:opacity-50 disabled:cursor-not-allowed"
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
      </div>

      {/* Message Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-800">Vista Previa del Mensaje</h3>
              <button
                onClick={() => setShowPreview(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-slate-600" />
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