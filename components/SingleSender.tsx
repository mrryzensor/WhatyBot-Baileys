import React, { useState, useRef, useEffect } from 'react';
import { Send, Phone, AlertCircle } from 'lucide-react';
import { MessageLog, ScheduledMessage } from '../types';
import { sendMessage, sendMediaMessage } from '../services/api';
import { MessagePreview } from './MessagePreview';
import { MediaUpload } from './MediaUpload';
import { MessageEditorToolbar } from './MessageEditorToolbar';
import { BulkProgressBar } from './BulkProgressBar';
import { ScheduleManager } from './ScheduleManager';
import { SubscriptionUpgradeModal } from './SubscriptionUpgradeModal';
import { useSchedule } from '../hooks/useSchedule';
import { useMedia } from '../hooks/useMedia';
import { getSubscriptionLimits } from '../services/usersApi';
import { getCurrentUser as getAuthUser } from '../services/authApi';

interface SingleSenderProps {
    isConnected: boolean;
    addLog: (log: MessageLog) => void;
    toast: {
        success: (message: string) => void;
        error: (message: string) => void;
        warning: (message: string) => void;
        info: (message: string) => void;
    };
    onNavigate?: (tab: string) => void;
}

export const SingleSender: React.FC<SingleSenderProps & { defaultCountryCode?: string }> = ({
    isConnected,
    addLog,
    toast,
    onNavigate,
    defaultCountryCode
}) => {
    const [countryCode, setCountryCode] = useState(defaultCountryCode || '');
    const [localNumber, setLocalNumber] = useState('');
    const [phone, setPhone] = useState('');
    const [message, setMessage] = useState('');
    const media = useMedia({ maxFiles: 50 });
    const [isSending, setIsSending] = useState(false);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [subscriptionLimits, setSubscriptionLimits] = useState<any[]>([]);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const messageTextareaRef = useRef<HTMLTextAreaElement>(null);
    const [limitError, setLimitError] = useState<any>(null);

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

    useEffect(() => {
        setCountryCode(defaultCountryCode || '');
    }, [defaultCountryCode]);

    useEffect(() => {
        // Solo para mostrar algo combinado en el preview
        const display = `${countryCode || ''}${localNumber ? ` ${localNumber}` : ''}`.trim();
        setPhone(display);
    }, [countryCode, localNumber]);

    const handleSend = async () => {
        if (!countryCode || !localNumber) {
            toast.error('Por favor ingresa el código de país y el número de teléfono');
            return;
        }
        if (!message && media.mediaItems.length === 0) {
            toast.error('Por favor ingresa un mensaje o selecciona un archivo');
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
        setIsSending(true);

        try {
            // Clean and combine country code + local number
            const ccDigits = (countryCode || '').replace(/\D/g, '');
            const numberDigits = (localNumber || '').replace(/\D/g, '');
            const cleanPhone = `${ccDigits}${numberDigits}`;
            if (cleanPhone.length < 10) {
                throw new Error('El número parece ser demasiado corto');
            }

            let response;
            const scheduleDate = schedule.scheduleType === 'datetime' ? schedule.scheduledAt : 
                                schedule.scheduleType === 'delay' ? new Date(Date.now() + (schedule.delayMinutes || 0) * 60 * 1000) : 
                                undefined;

            if (media.mediaItems.length > 0) {
                // Enviar un solo mensaje con todos los adjuntos seleccionados
                const files = media.mediaItems
                    .map((item) => item.file)
                    .filter((f): f is File => !!f);
                const captions = media.mediaItems.map((item) => item.caption || '');

                response = await sendMediaMessage(
                    cleanPhone,
                    message,
                    files,
                    captions,
                    scheduleDate
                );
            } else {
                response = await sendMessage(cleanPhone, message, scheduleDate);
            }

            if (response.success) {
                if (schedule.scheduleType === 'now') {
                    addLog({
                        id: Date.now().toString(),
                        target: cleanPhone,
                        status: 'sent',
                        timestamp: new Date(),
                        content: message || '[Archivo adjunto]'
                    });
                    toast.success('¡Mensaje enviado exitosamente!');
                } else {
                    // Save scheduled message to localStorage
                    const scheduledMessage: ScheduledMessage = {
                        id: response.jobId || Date.now().toString(),
                        type: 'single',
                        recipients: [cleanPhone],
                        message: message || '[Archivo multimedia]',
                        scheduleType: schedule.scheduleType,
                        delayMinutes: schedule.delayMinutes,
                        scheduledAt: scheduleDate,
                        status: 'scheduled',
                        createdAt: new Date(),
                        file: media.mediaItems.length > 0 ? media.mediaItems[0].file : undefined,
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
                    
                    toast.success('¡Mensaje programado exitosamente!');
                    
                    // Navigate to scheduled messages tab
                    if (onNavigate) {
                        setTimeout(() => onNavigate('scheduled'), 1000);
                    }
                }
                setCountryCode(defaultCountryCode || '');
                setLocalNumber('');
                setPhone('');
                setMessage('');
                media.clearAll();
                schedule.reset();
            } else {
                throw new Error(response.error || 'Error al enviar mensaje');
            }
        } catch (error: any) {
            console.error('Error sending message:', error);
            
            // Check if error is due to limit exceeded
            if (error.response?.status === 403 && error.response?.data?.limitExceeded && currentUser?.subscription_type !== 'administrador') {
                setLimitError(error.response.data);
                setShowUpgradeModal(true);
            } else {
                toast.error(`Error al ${schedule.scheduleType === 'now' ? 'enviar' : 'programar'} mensaje: ${error.message}`);
            }
        } finally {
            setIsSending(false);
        }
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
            
            <div className="max-w-7xl mx-auto">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100 bg-slate-50">
                    <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                        <Phone size={20} className="text-green-600" />
                        Enviar Mensaje Individual
                    </h3>
                    <p className="text-sm text-slate-500 mt-1">
                        Envía un mensaje rápido a un número específico sin guardarlo en contactos.
                    </p>
                </div>

                <div className="p-6 space-y-6 md:space-y-0 md:grid md:grid-cols-2 md:gap-6">
                    {/* Phone Input */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Número de Teléfono
                        </label>
                        <div className="flex flex-col sm:flex-row gap-3">
                            <div className="sm:w-40">
                                <label className="block text-xs font-medium text-slate-600 mb-1">País</label>
                                <input
                                    type="text"
                                    placeholder="Ej: +51, +54, +1"
                                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm"
                                    value={countryCode}
                                    onChange={(e) => setCountryCode(e.target.value)}
                                />
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs font-medium text-slate-600 mb-1">Número</label>
                                <div className="relative">
                                    <Phone size={18} className="absolute left-3 top-2.5 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Ej: 987654321"
                                        className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono"
                                        value={localNumber}
                                        onChange={(e) => setLocalNumber(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                            Ingresa el código de país en el primer campo (con o sin +) y el número local en el segundo.
                        </p>
                    </div>

                    {/* Message Input */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Mensaje
                        </label>
                        {/* Message Editor Toolbar */}
                        <MessageEditorToolbar
                            textareaRef={messageTextareaRef}
                            value={message}
                            onChange={setMessage}
                            showVariables={false}
                        />
                        <textarea
                            ref={messageTextareaRef}
                            className="w-full h-32 p-4 border border-slate-200 rounded-lg resize-none focus:ring-2 focus:ring-green-500 focus:border-transparent mt-2"
                            placeholder="Escribe tu mensaje aquí..."
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                        />

                        {/* Inline Preview */}
                        {message && (
                            <div className="mt-4">
                                <MessagePreview 
                                    message={message}
                                    contactName={phone || 'Contacto'}
                                    inline={true}
                                />
                            </div>
                        )}
                    </div>

                    {/* Media Upload */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Archivos Adjuntos
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

                    {/* Schedule Picker */}
                    <div>
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
                        />
                    </div>

                    {/* Send Button */}
                    <div className="pt-4 border-t border-slate-100 flex items-center justify-between md:col-span-2">
                        <div className="flex items-center gap-2 text-yellow-600 text-xs">
                            {!isConnected && (
                                <>
                                    <AlertCircle size={14} />
                                    <span>Cliente no conectado</span>
                                </>
                            )}
                        </div>
                        <button
                            onClick={handleSend}
                            disabled={!isConnected || isSending || (!message && media.mediaItems.length === 0) || !phone}
                            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-bold text-white transition-all ${!isConnected || isSending || (!message && media.mediaItems.length === 0) || !phone
                                    ? 'bg-slate-300 cursor-not-allowed'
                                    : 'bg-green-600 hover:bg-green-700 shadow-lg shadow-green-900/20'
                                }`}
                        >
                            {isSending ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    {schedule.scheduleType === 'now' ? 'Enviando...' : 'Programando...'}
                                </>
                            ) : (
                                <>
                                    <Send size={18} />
                                    {schedule.scheduleType === 'now' ? 'Enviar Mensaje' : 'Programar Mensaje'}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

        </div>
        </>
    );
};
