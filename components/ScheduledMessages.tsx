import React, { useState, useEffect } from 'react';
import { Clock, Calendar, Trash2, Edit2, AlertCircle, CheckCircle } from 'lucide-react';
import { ScheduledMessage } from '../types';
import { ConfirmModal } from './ConfirmModal';
import { cancelScheduledJob, updateScheduledJob } from '../services/api';

export const ScheduledMessages: React.FC = () => {
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(new Date());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingScheduledAt, setEditingScheduledAt] = useState<string>('');

  // Load scheduled messages from localStorage or API
  useEffect(() => {
    loadScheduledMessages();
    
    // Listen for storage events to update when messages are added from other tabs
    const handleStorageChange = () => {
      loadScheduledMessages();
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // Update current time every second for countdown
    const timeInterval = setInterval(() => {
      setNow(new Date());
    }, 1000);
    
    // Also check periodically for updates
    const interval = setInterval(loadScheduledMessages, 2000);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
      clearInterval(timeInterval);
    };
  }, []);

  const loadScheduledMessages = () => {
    setLoading(true);
    // Simulate loading - in real app this would come from API
    const saved = localStorage.getItem('scheduledMessages');
    if (saved) {
      const messages = JSON.parse(saved).map((msg: any) => {
        const scheduledAt = msg.scheduledAt ? new Date(msg.scheduledAt) : undefined;
        const createdAt = new Date(msg.createdAt);
        
        // Check if message was already sent (scheduledAt is in the past and status is still scheduled)
        let status = msg.status;
        if (status === 'scheduled' && scheduledAt && scheduledAt <= now) {
          // Message should have been sent, update status
          status = 'sent';
        }
        
        return {
          ...msg,
          createdAt,
          scheduledAt,
          status
        };
      });
      
      // Update localStorage if status changed
      const hasChanges = messages.some((msg, idx) => {
        const savedMsg = JSON.parse(saved)[idx];
        return msg.status !== savedMsg.status;
      });
      
      if (hasChanges) {
        localStorage.setItem('scheduledMessages', JSON.stringify(messages.map(msg => ({
          ...msg,
          scheduledAt: msg.scheduledAt?.toISOString(),
          createdAt: msg.createdAt.toISOString()
        }))));
      }
      
      setScheduledMessages(messages);
    }
    setLoading(false);
  };
  
  const getTimeRemaining = (scheduledAt?: Date, createdAt?: Date): { time: string; isPast: boolean; progress: number } => {
    if (!scheduledAt) return { time: 'N/A', isPast: false, progress: 0 };
    
    const diff = scheduledAt.getTime() - now.getTime();
    const isPast = diff <= 0;
    
    if (isPast) {
      return { time: 'Enviado', isPast: true, progress: 100 };
    }
    
    // Calculate progress based on time elapsed vs total time
    let progress = 0;
    if (createdAt) {
      const totalTime = scheduledAt.getTime() - createdAt.getTime();
      const elapsedTime = now.getTime() - createdAt.getTime();
      progress = Math.min(100, Math.max(0, (elapsedTime / totalTime) * 100));
    }
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    let timeStr = '';
    if (days > 0) {
      timeStr = `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      timeStr = `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      timeStr = `${minutes}m ${seconds % 60}s`;
    } else {
      timeStr = `${seconds}s`;
    }
    
    return { time: timeStr, isPast: false, progress };
  };

  const deleteScheduledMessage = (id: string) => {
    const msg = scheduledMessages.find(m => m.id === id);
    if (!msg) return;

    // Si ya está enviado o fallido, lo quitamos directamente de la lista (sólo local)
    if (msg.status === 'sent' || msg.status === 'failed' || msg.status === 'cancelled') {
      const updated = scheduledMessages.filter(m => m.id !== id);
      setScheduledMessages(updated);
      localStorage.setItem('scheduledMessages', JSON.stringify(updated.map(m => ({
        ...m,
        scheduledAt: m.scheduledAt?.toISOString(),
        createdAt: m.createdAt.toISOString()
      }))));
      return;
    }

    // Para pendientes/programados mostramos confirmación (y cancelamos en backend)
    setMessageToDelete(id);
    setShowDeleteModal(true);
  };

  const confirmDeleteMessage = async () => {
    if (!messageToDelete) return;
    try {
      const msg = scheduledMessages.find(m => m.id === messageToDelete);

      // Sólo intentamos cancelar en backend si sigue pendiente/programado
      if (msg && (msg.status === 'pending' || msg.status === 'scheduled')) {
        try {
          await cancelScheduledJob(messageToDelete);
        } catch (e) {
          console.warn('Error cancelling scheduled job in backend (continuing with local removal):', e);
        }
      }

      // En lugar de borrar el card, marcamos como cancelado
      const updated = scheduledMessages.map(m => {
        if (m.id === messageToDelete) {
          return {
            ...m,
            status: 'cancelled'
          };
        }
        return m;
      });
      setScheduledMessages(updated);
      localStorage.setItem('scheduledMessages', JSON.stringify(updated.map(m => ({
        ...m,
        scheduledAt: m.scheduledAt?.toISOString(),
        createdAt: m.createdAt.toISOString()
      }))));
    } finally {
      setShowDeleteModal(false);
      setMessageToDelete(null);
    }
  };

  const startEditMessage = (msg: ScheduledMessage) => {
    if (!msg.scheduledAt) return;
    setEditingId(msg.id);
    const local = new Date(msg.scheduledAt);
    const year = local.getFullYear();
    const month = String(local.getMonth() + 1).padStart(2, '0');
    const day = String(local.getDate()).padStart(2, '0');
    const hours = String(local.getHours()).padStart(2, '0');
    const minutes = String(local.getMinutes()).padStart(2, '0');
    setEditingScheduledAt(`${year}-${month}-${day}T${hours}:${minutes}`);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingScheduledAt('');
  };

  const saveEdit = async (msg: ScheduledMessage) => {
    if (!editingScheduledAt) return;
    const newDate = new Date(editingScheduledAt);
    if (isNaN(newDate.getTime())) {
      alert('Fecha y hora no válidas');
      return;
    }
    try {
      await updateScheduledJob(msg.id, newDate);
      const updatedMessages = scheduledMessages.map(m => {
        if (m.id === msg.id) {
          return {
            ...m,
            scheduledAt: newDate,
            status: 'scheduled'
          };
        }
        return m;
      });
      setScheduledMessages(updatedMessages);
      localStorage.setItem('scheduledMessages', JSON.stringify(updatedMessages.map(m => ({
        ...m,
        scheduledAt: m.scheduledAt?.toISOString(),
        createdAt: m.createdAt.toISOString()
      }))));
      cancelEdit();
    } catch (error) {
      console.error('Error updating scheduled job:', error);
      alert('No se pudo actualizar la programación. Por favor, inténtalo de nuevo.');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'scheduled': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'sent': return 'bg-green-100 text-green-800 border-green-300';
      case 'failed': return 'bg-red-100 text-red-800 border-red-300';
      case 'cancelled': return 'bg-slate-100 text-slate-800 border-slate-400';
      default: return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  };

  const getCardBorderColor = (status: string) => {
    switch (status) {
      case 'pending': return 'border-yellow-300';
      case 'scheduled': return 'border-blue-300';
      case 'sent': return 'border-green-300';
      case 'failed': return 'border-red-300';
      case 'cancelled': return 'border-slate-300';
      default: return 'border-slate-200';
    }
  };

  const formatScheduleInfo = (msg: ScheduledMessage) => {
    if (msg.scheduleType === 'now') return 'Inmediato';
    if (msg.scheduleType === 'delay' && msg.delayMinutes) {
      return `En ${msg.delayMinutes} minutos`;
    }
    if (msg.scheduleType === 'datetime' && msg.scheduledAt) {
      // Format in local timezone with date and time
      return msg.scheduledAt.toLocaleString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    }
    return 'No programado';
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-6 border-b border-slate-100">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <Clock size={18} />
          Mensajes Programados
        </h3>
      </div>

      <div className="p-6 max-h-[calc(100vh-12rem)] overflow-y-auto pr-2">
        {loading ? (
          <div className="text-center py-8 text-slate-400">
            <div className="w-8 h-8 border-2 border-slate-300 border-t-green-600 rounded-full animate-spin mx-auto mb-2"></div>
            <p>Cargando mensajes programados...</p>
          </div>
        ) : scheduledMessages.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <Calendar size={48} className="mx-auto mb-2 opacity-20" />
            <p>No hay mensajes programados</p>
            <p className="text-sm mt-1">Usa el programador para agendar envíos</p>
          </div>
        ) : (
          <div className="space-y-4">
            {scheduledMessages.map((message) => {
              const timeInfo = message.scheduleType === 'datetime' && message.scheduledAt 
                ? getTimeRemaining(message.scheduledAt, message.createdAt)
                : { time: '', isPast: false, progress: 0 };
              
              return (
                <div 
                  key={message.id} 
                  className={`border-2 ${getCardBorderColor(message.status)} rounded-lg p-4 hover:shadow-md transition-shadow ${
                    message.status === 'sent' ? 'bg-green-50' :
                    message.status === 'failed' ? 'bg-red-50' :
                    message.status === 'scheduled' ? 'bg-blue-50' :
                    message.status === 'cancelled' ? 'bg-slate-50' :
                    'bg-yellow-50'
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs px-3 py-1 rounded-full font-semibold border ${getStatusColor(message.status)}`}>
                          {message.status === 'pending' && 'Pendiente'}
                          {message.status === 'scheduled' && 'Programado'}
                          {message.status === 'sent' && 'Enviado'}
                          {message.status === 'failed' && 'Fallido'}
                          {message.status === 'cancelled' && 'Cancelado'}
                        </span>
                        <span className="text-xs text-slate-600 font-medium">
                          {message.type === 'single' && 'Individual'}
                          {message.type === 'bulk' && 'Masivo'}
                          {message.type === 'groups' && 'Grupos'}
                        </span>
                      </div>
                      
                      <div className="text-sm font-semibold text-slate-800 mb-1">
                        {message.recipients?.length || 0} destinatarios
                      </div>
                      
                      <div className="text-sm text-slate-700 mb-3 line-clamp-2">
                        {message.message}
                      </div>
                      
                      {/* Progress Bar for scheduled messages */}
                      {message.status === 'scheduled' && message.scheduleType === 'datetime' && message.scheduledAt && (
                        <div className="mb-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-blue-700">
                              Tiempo restante: {timeInfo.time}
                            </span>
                            <span className="text-xs text-blue-600">
                              {timeInfo.progress.toFixed(0)}%
                            </span>
                          </div>
                          <div className="w-full bg-blue-200 rounded-full h-2.5">
                            <div 
                              className="bg-blue-600 h-2.5 rounded-full transition-all duration-1000"
                              style={{ width: `${timeInfo.progress}%` }}
                            ></div>
                          </div>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-4 text-xs text-slate-600 flex-wrap">
                        <div className="flex items-center gap-1">
                          <Calendar size={12} />
                          <span>Programado: {formatScheduleInfo(message)}</span>
                        </div>
                        {message.scheduleType === 'datetime' && message.scheduledAt && (
                          <div className="flex items-center gap-1">
                            {message.status === 'scheduled' ? (
                              <span className="font-medium text-blue-600">
                                {timeInfo.time} restantes
                              </span>
                            ) : message.status === 'sent' ? (
                              <>
                                <CheckCircle size={12} className="text-green-600" />
                                <span className="font-medium text-green-600">Enviado</span>
                              </>
                            ) : (
                              <>
                                <AlertCircle size={12} className="text-red-600" />
                                <span className="font-medium text-red-600">Fallido</span>
                              </>
                            )}
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <Clock size={12} />
                          <span>Creado: {message.createdAt.toLocaleString('es-ES', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false
                          })}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1 ml-4">
                      {message.status === 'pending' || message.status === 'scheduled' ? (
                        <>
                          {message.scheduleType === 'datetime' && message.scheduledAt && (
                            <button
                              onClick={() => startEditMessage(message)}
                              className="p-1.5 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                              title="Editar fecha/hora programada"
                            >
                              <Edit2 size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => deleteScheduledMessage(message.id)}
                            className="p-1.5 text-red-600 hover:bg-red-100 rounded transition-colors"
                            title="Eliminar mensaje programado"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="p-1.5 text-slate-400">
                            {message.status === 'sent' ? (
                              <CheckCircle size={14} />
                            ) : (
                              <AlertCircle size={14} />
                            )}
                          </div>
                          <button
                            onClick={() => deleteScheduledMessage(message.id)}
                            className="p-1.5 text-slate-500 hover:bg-slate-100 rounded transition-colors"
                            title="Quitar de la lista"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {editingId === message.id && message.scheduleType === 'datetime' && message.scheduledAt && (
                    <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-md flex flex-col sm:flex-row sm:items-center gap-2">
                      <label className="text-xs font-medium text-slate-700 flex items-center gap-2">
                        <span>Nueva fecha y hora:</span>
                        <input
                          type="datetime-local"
                          className="border border-slate-300 rounded px-2 py-1 text-xs"
                          value={editingScheduledAt}
                          onChange={(e) => setEditingScheduledAt(e.target.value)}
                        />
                      </label>
                      <div className="flex gap-2 mt-2 sm:mt-0 sm:ml-auto">
                        <button
                          onClick={() => saveEdit(message)}
                          className="px-3 py-1 rounded-full bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
                        >
                          Guardar cambios
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-medium hover:bg-slate-200"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {message.file && (
                    <div className="mt-2 text-xs text-slate-600 flex items-center gap-1 font-medium">
                      📎 {message.file.name}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setMessageToDelete(null);
        }}
        onConfirm={confirmDeleteMessage}
        title="Eliminar Mensaje Programado"
        message="¿Estás seguro de que deseas eliminar este mensaje programado? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        cancelText="Cancelar"
        type="danger"
      />
    </div>
  );
};
