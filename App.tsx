import React, { useState, useEffect, useRef } from 'react';
import { Toaster, toast } from 'sonner';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { SingleSender } from './components/SingleSender';
import { MassSender } from './components/MassSender';
import { GroupManager } from './components/GroupManager';
import { Settings } from './components/Settings';
import { AutoReplyManager } from './components/AutoReplyManager';
import { ScheduledMessages } from './components/ScheduledMessages';
import { UserManager } from './components/UserManager';
import { Login } from './components/Login';
import { ToastContainer } from './components/Toast';
import { BulkProgressBar } from './components/BulkProgressBar';
import { ConfirmModal } from './components/ConfirmModal';
import { useBulkQueueControl } from './hooks/useBulkQueueControl';
import { useToast } from './hooks/useToast';
import { Tab, MessageLog, AppConfig, AutoReplyRule, Group } from './types';
import { initializeSocket, getAutoReplyRules, getConfig, initialize, getMessageLogs, waitForBackendPort, getQr, resetWhatsAppSession, getGroups } from './services/api';
import { isAuthenticated as checkAuth, getCurrentUser } from './services/authApi';
import { getSubscriptionLimits } from './services/usersApi';
import { SubscriptionUpgradeModal } from './components/SubscriptionUpgradeModal';

function App() {
  const [isAuthenticatedState, setIsAuthenticatedState] = useState<boolean>(checkAuth());
  const [currentUser, setCurrentUser] = useState<any>(getCurrentUser());
  const [activeTab, setActiveTab] = useState<Tab>(Tab.DASHBOARD);
  const [isInitializing, setIsInitializing] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectedPhone, setConnectedPhone] = useState<string | null>(null);
  const lastGroupsLoadRef = useRef<number>(0);
  const isLoadingGroupsRef = useRef<boolean>(false);
  const [config, setConfig] = useState<AppConfig>({
    chromePath: '',
    headless: false,
    messageDelay: 1000,
    maxContactsPerBatch: 50,
    waitTimeBetweenBatches: 15,
    defaultCountryCode: ''
  });

  const [socketStatus, setSocketStatus] = useState('Initializing...');
  const { toasts, removeToast, success, error, warning, info } = useToast();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [limitError, setLimitError] = useState<any>(null);
  const [subscriptionLimits, setSubscriptionLimits] = useState<any[]>([]);
  const [socketInstance, setSocketInstance] = useState<any>(null);
  const [bulkProgress, setBulkProgress] = useState<{
    current: number;
    total: number;
    status?: 'processing' | 'waiting' | 'completed';
    batch?: number;
    totalBatches?: number;
    waitMinutes?: number;
  } | null>(null);
  const [bulkWaitSecondsLeft, setBulkWaitSecondsLeft] = useState<number | null>(null);
  const [groupProgress, setGroupProgress] = useState<{ current: number; total: number } | null>(null);
  const [groupsCache, setGroupsCache] = useState<Group[]>([]);
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [rules, setRules] = useState<AutoReplyRule[]>([]);

  const bulkQueueControl = useBulkQueueControl(bulkProgress);
  const [showCancelBulkModal, setShowCancelBulkModal] = useState(false);
  const [phoneLimitModal, setPhoneLimitModal] = useState<{ show: boolean; phone: string | null; message: string | null }>({ show: false, phone: null, message: null });

  // Listen for auto-updater status events from main process and show toasts
  useEffect(() => {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI || !electronAPI.updates || !electronAPI.updates.onStatus) {
      return;
    }

    const unsubscribe = electronAPI.updates.onStatus((payload: { status: string; version?: string | null; message?: string }) => {
      const version = payload.version ? ` (${payload.version})` : '';
      switch (payload.status) {
        case 'checking':
          toast.info('Buscando actualizaciones...');
          break;
        case 'available':
          toast.info(`Actualización disponible${version}, descargando...`);
          break;
        case 'downloaded':
          toast.success(`Actualización descargada${version}. Se instalará al cerrar la aplicación.`);
          break;
        case 'no-update':
          // No mostrar toast para no molestar en cada inicio; descomentar si se quiere informar siempre
          // toast.info('Ya estás usando la última versión.');
          break;
        case 'error':
          toast.error(`Error al comprobar actualizaciones: ${payload.message || 'desconocido'}`);
          break;
        default:
          break;
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  const handleLoginSuccess = async (user: any) => {
    setCurrentUser(user);
    setIsAuthenticatedState(true);
    setActiveTab(Tab.DASHBOARD); // Always start at Dashboard after login
    
    // Notify server about logged-in user via Socket.IO
    await waitForBackendPort();
    const socket = initializeSocket();
    if (socket && user && user.id) {
      socket.emit('user_logged_in', { userId: user.id });
      console.log(`[App] Notified server of logged-in user: ${user.id}`);
    }
    
    // Load message logs and subscription limits for the logged-in user
    try {
      await waitForBackendPort();
      const [logsResponse, limitsResponse] = await Promise.all([
        getMessageLogs(100),
        getSubscriptionLimits()
      ]);
      
      if (logsResponse.success && logsResponse.logs) {
        const logsWithDates = logsResponse.logs.map((log: any) => ({
          ...log,
          timestamp: new Date(log.timestamp)
        }));
        setLogs(logsWithDates);
      }
      
      if (limitsResponse.success) {
        setSubscriptionLimits(limitsResponse.limits);
      }
    } catch (error) {
      console.error('Error loading data after login:', error);
    }
  };

  // Countdown para la pausa entre lotes en envíos masivos (se congela si la cola está en pausa)
  useEffect(() => {
    if (!bulkProgress || bulkProgress.status !== 'waiting' || bulkWaitSecondsLeft == null) {
      return;
    }

    // No decrementar mientras el usuario tenga la cola en pausa
    if (bulkQueueControl.status === 'paused') {
      return;
    }

    if (bulkWaitSecondsLeft <= 0) {
      return;
    }

    const interval = setInterval(() => {
      setBulkWaitSecondsLeft((prev) => {
        if (prev == null || prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [bulkProgress, bulkWaitSecondsLeft, bulkQueueControl.status]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('isAuthenticated');
    setCurrentUser(null);
    setIsAuthenticatedState(false);
    setActiveTab(Tab.DASHBOARD); // Reset to Dashboard on logout
  };

  useEffect(() => {
    // Always start at Dashboard when user is authenticated
    if (isAuthenticatedState && currentUser) {
      setActiveTab(Tab.DASHBOARD);
    }
    
    let socket: any = null;
    let isMounted = true;

    const setupSocket = async () => {
      await waitForBackendPort();
      if (!isMounted) return;

      socket = initializeSocket();
      setSocketInstance(socket);

      // Notify server about current user if already logged in
      if (currentUser && currentUser.id) {
        socket.emit('user_logged_in', { userId: currentUser.id });
        console.log(`[App] Notified server of logged-in user on mount: ${currentUser.id}`);
      }

      // Ensure socket is connected (in case it was disconnected by cleanup)
      if (socket.disconnected) {
        socket.connect();
      }

      socket.on('connect', () => {
        console.log('SOCKET CONNECTED:', socket.id);
        setSocketStatus('Connected');
      });

      socket.on('connect_error', (err) => {
        console.error('SOCKET ERROR:', err);
        setSocketStatus(`Error: ${err.message}`);
      });

      socket.on('disconnect', () => {
        console.log('SOCKET DISCONNECTED');
        setSocketStatus('Disconnected');
      });

      // Listen for status event (sent on connection)
      socket.on('status', async (status: any) => {
        console.log('STATUS RECEIVED:', status);
        setIsConnected(!!status.isReady);

        // Try to read phone from status.info.phone
        const phone = status?.info?.phone || null;
        setConnectedPhone(phone || null);

        if (status.isReady) {
          setQrCode(null);
          setIsInitializing(false);
          try {
            await loadGroups();
          } catch (e) {
            console.error('Error loading groups on status ready:', e);
          }
        } else if (status.hasQR) {
          // Fallback: fetch QR via API if socket event did not arrive yet
          try {
            if (status.qr) {
              setQrCode(status.qr);
            } else {
              const res = await getQr();
              if (res.success && res.qr) {
                setQrCode(res.qr);
              }
            }
          } catch (e) {
            // Ignore fetch errors; socket 'qr' may arrive later
          } finally {
            setIsInitializing(false);
          }
        }
      });

      // Listen for QR code
      socket.on('qr', (data: { qr: string }) => {
        console.log('QR EVENT RECEIVED:', data.qr.substring(0, 50) + '...');
        setQrCode(data.qr);
        setIsConnected(false);
        setIsInitializing(false); // Stop loading when QR arrives
      });

      // Listen for ready event
      socket.on('ready', (data?: any) => {
        console.log('WhatsApp connected', data);
        setIsConnected(true);
        if (data && data.phone) {
          setConnectedPhone(data.phone);
        }
        setQrCode(null);
        setIsInitializing(false);
        loadGroups().catch((e) => {
          console.error('Error loading groups on ready:', e);
        });
      });

      // Listen for authenticated event
      socket.on('authenticated', (data?: any) => {
        console.log('Authenticated', data);
        if (data && data.phone) {
          setConnectedPhone(data.phone);
        }
      });

      // Listen for disconnected event
      socket.on('disconnected', (data: { reason: string }) => {
        console.log('Disconnected:', data.reason);
        setIsConnected(false);
        setConnectedPhone(null);
      });

      // Listen for phone limit exceeded event
      socket.on('phone_limit_exceeded', (data: { phone: string; userId: string; message?: string }) => {
        console.log('Phone limit exceeded:', data);
        setPhoneLimitModal({
          show: true,
          phone: data.phone,
          message: data.message || 'Este número de WhatsApp ya está sincronizado con el máximo de cuentas permitidas (2).'
        });
      });

      // Listen for message logs - only add logs for current user
      socket.on('message_log', (log: MessageLog) => {
        // Only add log if it belongs to current user or has no userId (backward compatibility)
        if (log.userId && currentUser && log.userId !== currentUser.id) {
          return; // Skip logs from other users
        }
      
      // Ensure timestamp is a Date object
      const processedLog = {
        ...log,
        timestamp: new Date(log.timestamp)
      };
      setLogs(prev => [...prev, processedLog]);
      
      // Update scheduled messages status if it's a scheduled message
      if (log.id && log.id.startsWith('scheduled-')) {
        const existing = localStorage.getItem('scheduledMessages');
        if (existing) {
          const scheduledMessages = JSON.parse(existing);
          const updated = scheduledMessages.map((msg: any) => {
            // Match by jobId or check if it's the same message
            if (log.id.includes(msg.id) || (msg.recipients && msg.recipients.includes(log.target))) {
              return {
                ...msg,
                status: log.status === 'sent' ? 'sent' : 'failed'
              };
            }
            return msg;
          });
          localStorage.setItem('scheduledMessages', JSON.stringify(updated));
        }
      }
    });

    // Listen for limit exceeded events (from auto-replies or other sources)
    socket.on('limit_exceeded', async (data: any) => {
      // Don't show modal for administrators (they have unlimited messages)
      if (data.userId === currentUser?.id && currentUser?.subscription_type !== 'administrador') {
        console.log('Limit exceeded for current user:', data);
        // Load subscription limits if not already loaded
        if (subscriptionLimits.length === 0) {
          try {
            const limitsResponse = await getSubscriptionLimits();
            if (limitsResponse.success) {
              setSubscriptionLimits(limitsResponse.limits);
            }
          } catch (error) {
            console.error('Error loading subscription limits:', error);
          }
        }
        // Show upgrade modal
        setLimitError(data);
        setShowUpgradeModal(true);
      }
    });

    // Listen for bulk send progress
    socket.on('bulk_progress', (data: any) => {
      console.log('Bulk progress:', data);
      // Only track progress / logs for current user
      if (data.userId && currentUser && data.userId !== currentUser.id) {
        return; // Skip progress from other users
      }

      // Si el servidor notifica cancelación explícita, cerrar la cola inmediatamente
      if (data.status === 'cancelled') {
        setBulkProgress(null);
        setBulkWaitSecondsLeft(null);
        return;
      }

      if (data.status === 'waiting') {
        setBulkProgress({
          current: data.current ?? 0,
          total: data.total ?? data.totalContacts ?? 0,
          status: 'waiting',
          batch: data.batch,
          totalBatches: data.totalBatches,
          waitMinutes: data.waitMinutes
        });

        if (typeof data.waitMinutes === 'number') {
          setBulkWaitSecondsLeft(Math.max(0, Math.floor(data.waitMinutes * 60)));
        }
      } else {
        const total = data.total ?? data.totalContacts ?? 0;
        const current = data.current ?? 0;
        const isCompleted = total > 0 && current >= total;

        setBulkProgress({
          current,
          total,
          status: isCompleted ? 'completed' : 'processing',
          batch: data.batch,
          totalBatches: data.totalBatches
        });

        setBulkWaitSecondsLeft(null);

        if (isCompleted) {
          setTimeout(() => {
            setBulkProgress(null);
          }, 3000);
        }
      }

      // Add individual log for each contacto, excepto cuando solo estamos en espera entre lotes
      if (data.status !== 'waiting' && data.contact) {
        addLog({
          id: `bulk-${Date.now()}-${data.contact}`,
          userId: data.userId || currentUser?.id || null,
          target: data.contact,
          status: data.status,
          timestamp: new Date(),
          content: `Envío masivo (${data.current}/${data.total})`
        });
      }
    });

    // Listen for group send progress
    socket.on('group_progress', (data: any) => {
      console.log('Group progress:', data);
      if (data.userId && currentUser && data.userId !== currentUser.id) {
        return;
      }

      setGroupProgress({
        current: data.current,
        total: data.total
      });

      if (data.current >= data.total) {
        setTimeout(() => {
          setGroupProgress(null);
        }, 3000);
      }
    });

    // Load initial data
      loadAutoReplyRules();
      loadConfig();
      loadMessageLogs();
    };

    setupSocket();

    return () => {
      isMounted = false;
      if (socket) {
        socket.off('connect');
        socket.off('connect_error');
        socket.off('disconnect');
        socket.off('status');
        socket.off('qr');
        socket.off('ready');
        socket.off('authenticated');
        socket.off('message_log');
        socket.off('bulk_progress');
        socket.off('group_progress');
      }
    };
  }, [isAuthenticatedState, currentUser]); // Reload when auth state or user changes

  const loadGroups = async () => {
    // Prevent spamming the backend when socket emits repeated ready/status events
    const now = Date.now();
    if (isLoadingGroupsRef.current) return;
    if (now - lastGroupsLoadRef.current < 3000) return;

    try {
      isLoadingGroupsRef.current = true;
      lastGroupsLoadRef.current = now;
      await waitForBackendPort();
      const response = await getGroups();
      if (Array.isArray(response.groups)) {
        setGroupsCache(response.groups);
      }
    } catch (error) {
      console.error('Error loading groups:', error);
    } finally {
      isLoadingGroupsRef.current = false;
    }
  };

  const loadAutoReplyRules = async () => {
    try {
      await waitForBackendPort();
      const response = await getAutoReplyRules();
      if (response.success) {
        setRules(response.rules);
      }
    } catch (error) {
      console.error('Error loading rules:', error);
    }
  };

  const loadConfig = async () => {
    try {
      await waitForBackendPort();
      const response = await getConfig();
      if (response.success) {
        setConfig(response.config);
      }
    } catch (error) {
      console.error('Error loading config:', error);
    }
  };

  const loadMessageLogs = async () => {
    try {
      // Only load logs if user is authenticated
      if (isAuthenticatedState && currentUser) {
        await waitForBackendPort();
        const response = await getMessageLogs(100);
        if (response.success && response.logs) {
          // Convert timestamps to Date objects
          const logsWithDates = response.logs.map((log: any) => ({
            ...log,
            timestamp: new Date(log.timestamp)
          }));
          setLogs(logsWithDates);
        }
      }
    } catch (error) {
      console.error('Error loading message logs:', error);
    }
  };

  const loadSubscriptionLimits = async () => {
    try {
      if (isAuthenticatedState && currentUser) {
        await waitForBackendPort();
        const response = await getSubscriptionLimits();
        if (response.success) {
          setSubscriptionLimits(response.limits);
        }
      }
    } catch (error) {
      console.error('Error loading subscription limits:', error);
    }
  };

  const addLog = (log: MessageLog) => {
    // Only add log if it belongs to current user or has no userId (backward compatibility)
    if (log.userId && currentUser && log.userId !== currentUser.id) {
      return; // Skip logs from other users
    }
    // Set userId if not present (for backward compatibility)
    const logWithUserId = {
      ...log,
      userId: log.userId || currentUser?.id || null
    };
    setLogs(prev => [...prev, logWithUserId]);
  };

  const handleInitialize = async () => {
    setIsInitializing(true);
    try {
      await waitForBackendPort();
      await initialize();
    } catch (err) {
      console.error('Error initializing:', err);
      error('Error al iniciar el cliente de WhatsApp');
    } finally {
      setIsInitializing(false);
    }
  };

  const handleResetSession = async () => {
    setIsInitializing(true);
    try {
      await waitForBackendPort();
      await resetWhatsAppSession();
      success('Sesión eliminada. Escanea el nuevo QR.');
    } catch (err) {
      console.error('Error resetting session:', err);
      error('No se pudo reiniciar la sesión. Revisa la consola.');
    } finally {
      setIsInitializing(false);
    }
  };

  const handleNavigate = (tab: string) => {
    const tabMap = {
      'scheduled': Tab.SCHEDULED,
      'dashboard': Tab.DASHBOARD,
      'single': Tab.SINGLE_SENDER,
      'mass': Tab.MASS_SENDER,
      'groups': Tab.GROUPS,
      'autoReply': Tab.AUTO_REPLY,
      'users': Tab.USERS,
      'settings': Tab.SETTINGS
    };
    
    const targetTab = tabMap[tab];
    if (targetTab) {
      setActiveTab(targetTab);
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case Tab.DASHBOARD:
        return (
          <Dashboard
            isConnected={isConnected}
            logs={logs}
            qrCode={qrCode}
            onInitialize={handleInitialize}
            onResetSession={handleResetSession}
            isInitializing={isInitializing}
            socketStatus={socketStatus}
            currentUserId={currentUser?.id}
            currentUser={currentUser}
            connectedPhone={connectedPhone}
          />
        );
      case Tab.SINGLE_SENDER:
        return (
          <SingleSender
            isConnected={isConnected}
            addLog={addLog}
            toast={{ success, error, warning, info }}
            onNavigate={handleNavigate}
            defaultCountryCode={config.defaultCountryCode}
          />
        );
      case Tab.MASS_SENDER:
        return (
          <MassSender
            isConnected={isConnected}
            addLog={addLog}
            toast={{ success, error, warning, info }}
            onNavigate={handleNavigate}
            defaultCountryCode={config.defaultCountryCode}
          />
        );
      case Tab.GROUPS:
        return (
          <GroupManager
            isConnected={isConnected}
            addLog={addLog}
            toast={{ success, error, warning, info }}
            onNavigate={handleNavigate}
            initialGroups={groupsCache}
            onGroupsUpdate={setGroupsCache}
          />
        );
      case Tab.SCHEDULED:
        return <ScheduledMessages />;
      case Tab.AUTO_REPLY:
        return <AutoReplyManager rules={rules} setRules={setRules} toast={{ success, error, warning, info }} />;
      case Tab.USERS:
        // Solo administradores pueden acceder a la gestión de usuarios
        const isAdmin = (currentUser?.subscription_type || '').toString().toLowerCase() === 'administrador';
        if (!isAdmin) {
          return (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <h3 className="text-xl font-bold text-slate-800 mb-2">Acceso Denegado</h3>
                <p className="text-slate-600">Solo los administradores pueden acceder a la gestión de usuarios.</p>
              </div>
            </div>
          );
        }
        return <UserManager toast={{ success, error, warning, info }} />;
      case Tab.SETTINGS:
        return <Settings config={config} setConfig={setConfig} toast={{ success, error, warning, info }} />;
      default:
        return (
          <Dashboard
            isConnected={isConnected}
            logs={logs}
            qrCode={qrCode}
            onInitialize={handleInitialize}
            isInitializing={isInitializing}
            socketStatus={socketStatus}
            currentUserId={currentUser?.id}
            currentUser={currentUser}
            connectedPhone={connectedPhone}
          />
        );
    }
  };

  // Ensure Dashboard is active when user is authenticated
  useEffect(() => {
    if (isAuthenticatedState && currentUser && activeTab !== Tab.DASHBOARD) {
      // Only reset if we just logged in (check if this is the first render after login)
      const justLoggedIn = localStorage.getItem('justLoggedIn') === 'true';
      if (justLoggedIn) {
        setActiveTab(Tab.DASHBOARD);
        localStorage.removeItem('justLoggedIn');
      }
    }
  }, [isAuthenticatedState, currentUser, activeTab]);

  // Si no está autenticado, mostrar login (después de todos los hooks)
  if (!isAuthenticatedState || !currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="flex min-h-screen bg-[#f0f2f5]">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} onLogout={handleLogout} currentUser={currentUser} />
      <main className="flex-1 ml-64 p-8 overflow-x-hidden">
        {/* Top bar */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">
              {activeTab === Tab.DASHBOARD && 'Panel Principal'}
              {activeTab === Tab.SINGLE_SENDER && 'Envío Individual'}
              {activeTab === Tab.MASS_SENDER && 'Envíos Masivos'}
              {activeTab === Tab.GROUPS && 'Gestor de Grupos'}
              {activeTab === Tab.SCHEDULED && 'Mensajes Programados'}
              {activeTab === Tab.AUTO_REPLY && 'Reglas de Chatbot'}
              {activeTab === Tab.USERS && 'Gestión de Usuarios'}
              {activeTab === Tab.SETTINGS && 'Configuración del Sistema'}
            </h2>
            <p className="text-sm text-slate-500">
              Bienvenido, {currentUser?.username || currentUser?.email || 'Usuario'}
            </p>
          </div>
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm border border-slate-100">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
            <span className="text-xs font-semibold text-slate-600">
              {isConnected ? 'WhatyBot Activo' : 'Conectando...'}
            </span>
          </div>
        </div>

        {renderContent()}
      </main>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      {/* Global queue-style progress for massive and group sends */}
      {bulkProgress && (
        <BulkProgressBar
          current={bulkProgress.current}
          total={bulkProgress.total}
          isActive={true}
          status={bulkProgress.status}
          batch={bulkProgress.batch}
          totalBatches={bulkProgress.totalBatches}
          waitSecondsRemaining={bulkWaitSecondsLeft ?? undefined}
          waitTotalSeconds={bulkProgress.waitMinutes ? bulkProgress.waitMinutes * 60 : undefined}
          queueStatus={bulkQueueControl.status}
          onPause={bulkQueueControl.pause}
          onResume={bulkQueueControl.resume}
          onCancel={bulkQueueControl.cancel}
        />
      )}
      {groupProgress && (
        <BulkProgressBar
          current={groupProgress.current}
          total={groupProgress.total}
          isActive={true}
          title={groupProgress.current >= groupProgress.total ? '¡Envío a Grupos Completado!' : 'Enviando a Grupos'}
          subtitle={groupProgress.current >= groupProgress.total
            ? `${groupProgress.total} grupo(s) procesado(s)`
            : `Procesando grupo ${groupProgress.current} de ${groupProgress.total}`}
        />
      )}
      <Toaster position="top-right" richColors closeButton />
      
      {/* Global Upgrade Modal for auto-replies and other limit exceeded events */}
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

      {/* Modal for phone number limit exceeded */}
      {phoneLimitModal.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div className="bg-red-600 px-6 py-4">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                Número no permitido
              </h3>
            </div>
            <div className="p-6">
              <p className="text-slate-700 mb-4">
                {phoneLimitModal.message}
              </p>
              {phoneLimitModal.phone && (
                <p className="text-sm text-slate-500 mb-4">
                  Número: <span className="font-mono font-medium">+{phoneLimitModal.phone}</span>
                </p>
              )}
              <p className="text-sm text-slate-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <strong>Nota:</strong> Si deseas usar este número en esta cuenta, primero debes desvincularlo de una de las otras cuentas donde está registrado.
              </p>
            </div>
            <div className="bg-slate-50 px-6 py-4 flex justify-end">
              <button
                onClick={() => setPhoneLimitModal({ show: false, phone: null, message: null })}
                className="bg-slate-600 hover:bg-slate-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
