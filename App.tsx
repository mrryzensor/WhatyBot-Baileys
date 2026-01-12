import React, { useState, useEffect, useRef } from 'react';
import { Toaster, toast } from 'sonner';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { SingleSender } from './components/SingleSender';
import { MassSender } from './components/MassSender';
import { ContactsManager } from './components/ContactsManager';
import { GroupManager } from './components/GroupManager';
import { Settings } from './components/Settings';
import { AutoReplyManager } from './components/AutoReplyManager';
import { MenuManager } from './components/MenuManager';
import { ScheduledMessages } from './components/ScheduledMessages';
import { UserManager } from './components/UserManager';
import { Login } from './components/Login';
import { ToastContainer } from './components/Toast';
import { BulkProgressBar } from './components/BulkProgressBar';
import { useBulkQueueControl } from './hooks/useBulkQueueControl';
import { useToast } from './hooks/useToast';
import { Tab, MessageLog, AppConfig, AutoReplyRule, Group } from './types';
import { initializeSocket, getAutoReplyRules, getConfig, initialize, getMessageLogs, waitForBackendPort, getQr, resetWhatsAppSession, getGroups } from './services/api';
import { isAuthenticated as checkAuth, getCurrentUser } from './services/authApi';
import { getSubscriptionLimits } from './services/usersApi';
import { SubscriptionUpgradeModal } from './components/SubscriptionUpgradeModal';
import EmergencyRestart from './components/EmergencyRestart';
import { SessionProvider, useSession } from './context/SessionContext';
import { SessionSelector } from './components/SessionSelector';

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
    successCount?: number;
    failedCount?: number;
    status?: 'processing' | 'waiting' | 'completed';
    batch?: number;
    totalBatches?: number;
    waitMinutes?: number;
  } | null>(null);
  const [bulkWaitSecondsLeft, setBulkWaitSecondsLeft] = useState<number | null>(null);
  const [groupProgress, setGroupProgress] = useState<{
    current: number;
    total: number;
    successCount?: number;
    failedCount?: number;
    status?: 'sent' | 'failed' | 'processing';
  } | null>(null);
  const [groupsCache, setGroupsCache] = useState<Group[]>([]);
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [rules, setRules] = useState<AutoReplyRule[]>([]);

  const { selectedSession, loadSessions } = useSession();

  const bulkQueueControl = useBulkQueueControl(bulkProgress);
  const [phoneLimitModal, setPhoneLimitModal] = useState<{ show: boolean; phone: string | null; message: string | null }>({ show: false, phone: null, message: null });

  // Listen for auto-updater status events
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

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (bulkProgress && bulkProgress.current >= bulkProgress.total && bulkProgress.total > 0) {
      timer = setTimeout(() => {
        setBulkProgress(null);
        setBulkWaitSecondsLeft(null);
      }, 5000);
    }
    return () => clearTimeout(timer);
  }, [bulkProgress]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (groupProgress && groupProgress.current >= groupProgress.total && groupProgress.total > 0) {
      timer = setTimeout(() => {
        setGroupProgress(null);
      }, 5000);
    }
    return () => clearTimeout(timer);
  }, [groupProgress]);

  const handleLoginSuccess = async (user: any) => {
    setCurrentUser(user);
    setIsAuthenticatedState(true);
    setActiveTab(Tab.DASHBOARD);

    await waitForBackendPort();
    const socket = initializeSocket();
    if (socket) {
      setSocketStatus(socket.connected ? 'Connected' : 'Disconnected');
      socket.on('connect', () => setSocketStatus('Connected'));
      socket.on('disconnect', () => setSocketStatus('Disconnected'));

      if (user && user.id) {
        socket.emit('user_logged_in', { userId: user.id });
      }

      // Listeners de progreso
      socket.on('bulk_progress', (data: any) => {
        setBulkProgress(data);
      });

      socket.on('bulk_wait_seconds', (seconds: number) => {
        setBulkWaitSecondsLeft(seconds);
      });

      socket.on('group_progress', (data: any) => {
        setGroupProgress(data);
      });
    }

    // Load sessions after login
    await loadSessions();

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

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('isAuthenticated');
    setCurrentUser(null);
    setIsAuthenticatedState(false);
    setActiveTab(Tab.DASHBOARD);
  };

  useEffect(() => {
    let socket: any;

    const setupApp = async () => {
      if (isAuthenticatedState && currentUser) {
        try {
          await waitForBackendPort();
          socket = initializeSocket();
          if (socket) {
            setSocketStatus(socket.connected ? 'Connected' : 'Disconnected');
            socket.on('connect', () => setSocketStatus('Connected'));
            socket.on('disconnect', () => setSocketStatus('Disconnected'));

            setSocketInstance(socket);
            if (currentUser.id) {
              socket.emit('user_logged_in', { userId: currentUser.id });
            }

            // Listeners de progreso
            socket.on('bulk_progress', (data: any) => {
              setBulkProgress(data);
            });

            socket.on('bulk_wait_seconds', (seconds: number) => {
              setBulkWaitSecondsLeft(seconds);
            });

            socket.on('group_progress', (data: any) => {
              setGroupProgress(data);
            });

            socket.on('message_log', (log: any) => {
              addLog({
                ...log,
                timestamp: new Date(log.timestamp)
              });
            });
          }

          // Parallel data loading
          await Promise.all([
            loadAutoReplyRules(),
            loadConfig(),
            loadMessageLogs(),
            loadSessions()
          ]);
        } catch (err) {
          console.error('Error initializing app data:', err);
        }
      }
    };

    setupApp();

    return () => {
      if (socket) {
        socket.off('connect');
        socket.off('disconnect');
        socket.off('bulk_progress');
        socket.off('bulk_wait_seconds');
        socket.off('group_progress');
        socket.off('message_log');
      }
    };
  }, [isAuthenticatedState, currentUser?.id]);

  const loadGroups = async () => {
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
      if (isAuthenticatedState && currentUser) {
        await waitForBackendPort();
        const response = await getMessageLogs(100);
        if (response.success && response.logs) {
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

  const addLog = (log: MessageLog) => {
    if (log.userId && currentUser && log.userId !== currentUser.id) {
      return;
    }

    setLogs(prev => {
      // Evitar duplicados por ID
      if (prev.some(l => l.id === log.id)) {
        return prev;
      }

      const logWithUserId = {
        ...log,
        userId: log.userId || currentUser?.id || null
      };
      return [...prev, logWithUserId];
    });
  };

  return (
    <SessionProvider>
      <AppBody
        isAuthenticatedState={isAuthenticatedState}
        currentUser={currentUser}
        handleLogout={handleLogout}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        handleLoginSuccess={handleLoginSuccess}
        logs={logs}
        addLog={addLog}
        config={config}
        setConfig={setConfig}
        socketStatus={socketStatus}
        bulkProgress={bulkProgress}
        bulkWaitSecondsLeft={bulkWaitSecondsLeft}
        bulkQueueControl={bulkQueueControl}
        groupProgress={groupProgress}
        showUpgradeModal={showUpgradeModal}
        setShowUpgradeModal={setShowUpgradeModal}
        limitError={limitError}
        setLimitError={setLimitError}
        subscriptionLimits={subscriptionLimits}
        toasts={toasts}
        removeToast={removeToast}
        success={success}
        error={error}
        warning={warning}
        info={info}
        groupsCache={groupsCache}
        setGroupsCache={setGroupsCache}
        phoneLimitModal={phoneLimitModal}
        setPhoneLimitModal={setPhoneLimitModal}
        rules={rules}
        setRules={setRules}
      />
    </SessionProvider>
  );
}

function AppBody({
  isAuthenticatedState, currentUser, handleLogout, activeTab, setActiveTab,
  handleLoginSuccess, logs, addLog, config, setConfig, socketStatus,
  bulkProgress, bulkWaitSecondsLeft, bulkQueueControl, groupProgress,
  showUpgradeModal, setShowUpgradeModal, limitError, setLimitError,
  subscriptionLimits, toasts, removeToast, success, error, warning, info,
  groupsCache, setGroupsCache, phoneLimitModal, setPhoneLimitModal,
  rules, setRules
}: any) {
  const { selectedSession } = useSession();
  const isConnected = selectedSession?.isReady || false;

  const handleNavigate = (tab: string) => {
    const tabMap: any = {
      'scheduled': Tab.SCHEDULED,
      'dashboard': Tab.DASHBOARD,
      'single': Tab.SINGLE_SENDER,
      'mass': Tab.MASS_SENDER,
      'contacts': Tab.CONTACTS,
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

  if (!isAuthenticatedState || !currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case Tab.DASHBOARD:
        return (
          <Dashboard
            logs={logs}
            socketStatus={socketStatus}
            currentUserId={currentUser?.id}
            currentUser={currentUser}
            connectedPhone={selectedSession?.phoneNumber}
            onInitialize={() => {
              const el = document.getElementById('session-manager-area');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
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
      case Tab.CONTACTS:
        return (
          <ContactsManager
            isConnected={isConnected}
            toast={{ success, error, warning, info }}
            onNavigate={handleNavigate}
            initialGroups={groupsCache}
            onGroupsUpdate={setGroupsCache}
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
      case Tab.MENUS:
        return <MenuManager toast={{ success, error, warning, info }} />;
      case Tab.USERS:
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
        return <Dashboard
          isConnected={isConnected}
          logs={logs}
          isInitializing={false}
          socketStatus={socketStatus}
          currentUserId={currentUser?.id}
          currentUser={currentUser}
          connectedPhone={selectedSession?.phoneNumber}
          onInitialize={() => { }}
        />;
    }
  };

  return (
    <div className="flex min-h-screen bg-[#f8fafc]">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} onLogout={handleLogout} currentUser={currentUser} />
      <main className="flex-1 lg:ml-64 p-4 sm:p-6 lg:p-8 overflow-x-hidden pb-24 lg:pb-8">
        {/* Top bar */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">
              {activeTab === Tab.DASHBOARD && 'Panel Principal'}
              {activeTab === Tab.SINGLE_SENDER && 'Envío Individual'}
              {activeTab === Tab.MASS_SENDER && 'Envíos Masivos'}
              {activeTab === Tab.CONTACTS && 'Gestión de Contactos'}
              {activeTab === Tab.GROUPS && 'Gestor de Grupos'}
              {activeTab === Tab.SCHEDULED && 'Mensajes Programados'}
              {activeTab === Tab.AUTO_REPLY && 'Reglas de Chatbot'}
              {activeTab === Tab.MENUS && 'Menús Interactivos'}
              {activeTab === Tab.USERS && 'Gestión de Usuarios'}
              {activeTab === Tab.SETTINGS && 'Configuración del Sistema'}
            </h2>
            <p className="text-sm text-slate-500">
              Bienvenido, {currentUser?.username || currentUser?.email || 'Usuario'}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <SessionSelector />

            <div className="flex items-center gap-2 bg-white px-4 py-2.5 rounded-full shadow-sm border border-slate-100">
              <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
              <span className="text-xs font-bold text-slate-600">
                {isConnected ? 'WhatsApp Activo' : 'WhatsApp Desconectado'}
              </span>
            </div>
          </div>
        </div>

        {renderContent()}
      </main>
      <ToastContainer toasts={toasts} onRemove={removeToast} />

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
          successCount={bulkProgress.successCount}
          failedCount={bulkProgress.failedCount}
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
          successCount={groupProgress.successCount}
          failedCount={groupProgress.failedCount}
        />
      )}
      <Toaster position="top-right" richColors closeButton />

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

      <EmergencyRestart />
    </div>
  );
}

export default App;
