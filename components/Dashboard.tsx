import React, { useState, useEffect, useRef } from 'react';
import { Smartphone, Wifi, Activity, CheckCircle, XCircle, Crown, Gift, Zap, TrendingUp, AlertCircle, Infinity as InfinityIcon, CircleCheckBig } from 'lucide-react';
import { MessageLog } from '../types';
import { getSubscriptionLimits, getCurrentUser, getUserStats } from '../services/usersApi';
import { SessionManager, SessionManagerHandle } from './SessionManager';
import { useSession } from '../context/SessionContext';

interface DashboardProps {
  isConnected: boolean;
  logs: MessageLog[];
  qrCode?: string | null;
  onInitialize: () => void;
  onResetSession?: () => void;
  isInitializing: boolean;
  socketStatus?: string;
}

interface DashboardPropsWithUser extends DashboardProps {
  currentUserId?: number | null;
  currentUser?: any;
  connectedPhone?: string | null;
}

export const Dashboard: React.FC<DashboardPropsWithUser> = ({ logs, onInitialize, onResetSession, socketStatus, currentUserId, currentUser: propCurrentUser, connectedPhone }) => {
  const { sessions, selectedSession, selectedSessionId, loading: sessionsLoading, initializeSession, refreshQR } = useSession();
  const isConnected = selectedSession?.isReady || false;
  const qrCode = selectedSession?.status === 'waiting_qr' ? '(Cargando QR...)' : null; // QR handling will be via SessionManager or refreshQR
  console.log('Dashboard render:', { isConnected, hasQrCode: !!qrCode, qrCodeLength: qrCode?.length, socketStatus });

  const [userInfo, setUserInfo] = useState<any>(null);
  const [subscriptionLimits, setSubscriptionLimits] = useState<any[]>([]);
  const [userStats, setUserStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const qrContainerRef = useRef<HTMLDivElement>(null);
  const sessionManagerRef = useRef<SessionManagerHandle>(null);

  useEffect(() => {
    loadUserInfo();
  }, [currentUserId, propCurrentUser]);

  const loadUserInfo = async () => {
    try {
      setLoading(true);
      const user = propCurrentUser || await getCurrentUser();
      setUserInfo(user);

      const [limitsResponse, statsResponse] = await Promise.all([
        getSubscriptionLimits(),
        currentUserId ? getUserStats(currentUserId) : Promise.resolve(null)
      ]);

      if (limitsResponse.success) {
        setSubscriptionLimits(limitsResponse.limits);
      }

      if (statsResponse && statsResponse.success) {
        setUserStats(statsResponse.stats);
      }
    } catch (error) {
      console.error('Error loading user info:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatPhone = (phone?: string | null) => {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    // Caso típico Colombia: 57 + 10 dígitos (ej: 573001112233)
    if (digits.length === 12 && digits.startsWith('57')) {
      const cc = digits.slice(0, 2);
      const part1 = digits.slice(2, 5);
      const part2 = digits.slice(5, 8);
      const part3 = digits.slice(8);
      return `+${cc} ${part1} ${part2} ${part3}`;
    }
    // Fallback genérico: +<todo>
    return `+${digits}`;
  };

  // Filter logs by current user
  const userLogs = currentUserId
    ? logs.filter(l => !l.userId || l.userId === currentUserId)
    : logs; // Show all logs if no userId (backward compatibility)

  // Use DB count as source of truth for sent messages (includes auto-replies and all message types)
  const sentCountFromDB = userStats?.currentMonthCount || 0;
  // Also count from logs for display (may differ if logs weren't loaded or filtered)
  const sentCountFromLogs = userLogs.filter(l => l.status === 'sent').length;
  const failedCount = userLogs.filter(l => l.status === 'failed').length;

  // Get subscription info
  const subscriptionType = userInfo?.subscription_type || 'gratuito';
  const subscriptionLimit = subscriptionLimits.find(l => l.type === subscriptionType);
  const currentMonthCount = userStats?.currentMonthCount || 0;

  // Administrador always has unlimited messages
  const isUnlimited = subscriptionType === 'administrador' || subscriptionLimit?.messages === Infinity;
  const messagesLimit = isUnlimited ? Infinity : (subscriptionLimit?.messages || 0);
  const messagesRemaining = isUnlimited ? Infinity : Math.max(0, messagesLimit - currentMonthCount);
  const usagePercentage = isUnlimited ? 0 : (messagesLimit > 0 ? (currentMonthCount / messagesLimit) * 100 : 0);

  const getSubscriptionIcon = (type: string) => {
    switch (type) {
      case 'administrador': return <Crown className="text-yellow-600" size={20} />;
      case 'pro': return <Zap className="text-blue-600" size={20} />;
      case 'elite': return <TrendingUp className="text-purple-600" size={20} />;
      default: return <Gift className="text-primary-600" size={20} />;
    }
  };

  const getSubscriptionColor = (type: string) => {
    switch (type) {
      case 'administrador': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'pro': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'elite': return 'bg-purple-100 text-purple-800 border-purple-300';
      default: return 'bg-primary-100 text-primary-800 border-primary-300';
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

  const handleInitializeAndScroll = () => {
    if (sessionManagerRef.current) {
      sessionManagerRef.current.createSession();
    } else {
      onInitialize(); // fallback
    }
    // Scroll to QR container after a short delay to allow QR to render
    setTimeout(() => {
      qrContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 500);
  };

  return (
    <div className="space-y-4">
      <header className="mb-4 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-theme-main">Resumen del Sistema</h2>
          <p className="text-theme-muted">Estado en tiempo real de tu instancia WhatyBot.</p>
        </div>
        <div
          onClick={handleInitializeAndScroll}
          className={`text-xs px-3 py-1 rounded-full cursor-pointer transition-all hover:opacity-80 ${socketStatus === 'Connected' ? 'bg-primary-100 text-primary-700' : 'bg-red-100 text-red-700'}`}
          title="Haz clic para conectar WhatsApp y generar QR"
        >
          Socket: {socketStatus || (isConnected ? 'Conectado' : 'Desconectado')}
        </div>
      </header>

      {/* Subscription Info Card */}
      {!loading && userInfo && subscriptionLimit && (
        <div className={`bg-theme-card rounded-xl shadow-sm border-2 p-4 ${getSubscriptionColor(subscriptionType).split(' ')[0]} border-${subscriptionType === 'administrador' ? 'yellow' : subscriptionType === 'pro' ? 'blue' : subscriptionType === 'elite' ? 'purple' : 'green'}-300`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-theme-card/50 rounded-xl shadow-sm border border-white/60">
                {getSubscriptionIcon(subscriptionType)}
              </div>
              <div>
                <h3 className="text-xl font-black text-theme-main capitalize leading-none tracking-tight">{subscriptionType}</h3>
                <p className="text-sm font-medium text-theme-muted mt-2">
                  {userInfo.subscription_start_date && userInfo.subscription_end_date ? (
                    <span className="flex items-center gap-1.5">
                      Válido hasta: {formatDate(userInfo.subscription_end_date)}
                      {isSubscriptionExpired(userInfo.subscription_end_date) && (
                        <span className="ml-1 text-red-600 font-bold">(Expirada)</span>
                      )}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <InfinityIcon size={14} className="opacity-70" />
                      Suscripción permanente
                    </span>
                  )}
                </p>
              </div>
            </div>
            {subscriptionLimit.price > 0 && (
              <div className="text-right">
                <p className="text-xs text-theme-muted font-medium">Precio</p>
                <p className="text-lg font-bold text-theme-main">${subscriptionLimit.price}/mes</p>
              </div>
            )}
          </div>

          <div className="mt-4 bg-theme-card/50 p-4 rounded-xl border border-white/70 shadow-inner">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-bold text-theme-muted uppercase tracking-wide">Mensajes consumidos</span>
              <span className="text-sm font-black text-theme-main">
                <span className={`px-3 py-1 rounded-lg border ${isUnlimited ? 'text-primary-700 bg-primary-100/80 border-primary-200' :
                  usagePercentage >= 90 ? 'text-red-700 bg-red-100/80 border-red-200' :
                    'text-indigo-700 bg-indigo-100/80 border-indigo-200'
                  }`}>
                  {currentMonthCount} / {isUnlimited ? 'ILIMITADO' : messagesLimit.toLocaleString()}
                </span>
              </span>
            </div>

            {isUnlimited ? (
              <div className="flex items-center gap-4 py-1">
                <div className="flex items-center gap-1.5 text-xs font-black text-primary-700 bg-primary-100/50 px-3 py-1 rounded-lg border border-primary-200 shadow-sm">
                  <CircleCheckBig size={16} />
                  <span>SIN LÍMITES ACTIVOS</span>
                </div>
                <div className="h-6 w-px bg-slate-300/40"></div>
                <p className="text-xs text-theme-muted font-bold italic">Tu cuenta no tiene restricciones de envío de mensajes.</p>
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                <div className="w-full bg-slate-200/50 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${usagePercentage >= 90 ? 'bg-red-500' :
                      usagePercentage >= 70 ? 'bg-orange-500' :
                        'bg-primary-500'
                      }`}
                    style={{ width: `${Math.min(100, usagePercentage)}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className={`font-bold ${messagesRemaining === 0 ? 'text-red-600' : 'text-theme-muted'}`}>
                    {messagesRemaining === 0 ? 'Límite alcanzado' : `${messagesRemaining} mensajes restantes`}
                  </span>
                  <span className="text-theme-muted font-medium">
                    {usagePercentage.toFixed(1)}% utilizado
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {/* Card: Client Status */}
        <div
          onClick={handleInitializeAndScroll}
          className="bg-theme-card p-4 rounded-xl shadow-sm border border-theme flex items-center gap-3 cursor-pointer transition-all hover:shadow-md hover:scale-[1.02]"
          title="Haz clic para gestionar sesiones de WhatsApp"
        >
          <div className={`p-3 rounded-full flex-shrink-0 ${isConnected ? 'bg-primary-100 text-primary-600' : 'bg-red-100 text-red-600'}`}>
            <Wifi size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Cliente</p>
            <h3 className={`text-lg font-black truncate ${isConnected ? 'text-primary-600' : 'text-red-600'}`}>
              {isConnected ? 'CONECTADO' : 'DESCONECTADO'}
            </h3>
          </div>
        </div>

        {/* Card: Sent Messages */}
        <div className="bg-theme-card p-4 rounded-xl shadow-sm border border-theme flex items-center gap-3">
          <div className="p-3 rounded-full bg-blue-100 text-blue-600 flex-shrink-0">
            <CheckCircle size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Enviados</p>
            <div className="flex items-baseline gap-1.5">
              <h3 className="text-lg font-black text-theme-main">{sentCountFromDB}</h3>
              {sentCountFromDB !== sentCountFromLogs && (
                <span className="text-[10px] text-slate-400 font-medium">({sentCountFromLogs} rec.)</span>
              )}
            </div>
          </div>
        </div>

        {/* Card: Failed Messages */}
        <div className="bg-theme-card p-4 rounded-xl shadow-sm border border-theme flex items-center gap-3">
          <div className="p-3 rounded-full bg-red-100 text-red-600 flex-shrink-0">
            <XCircle size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Fallidos</p>
            <h3 className="text-lg font-black text-red-600">{failedCount}</h3>
          </div>
        </div>

        {/* Card: Queue Status */}
        <div className="bg-theme-card p-4 rounded-xl shadow-sm border border-theme flex items-center gap-3">
          <div className="p-3 rounded-full bg-orange-100 text-orange-600 flex-shrink-0">
            <Activity size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Cola</p>
            <h3 className="text-lg font-black text-theme-main">{userLogs.length > 0 ? 'ACTIVA' : 'INACTIVA'}</h3>
          </div>
        </div>
      </div>

      {/* Connection Area / QR Code */}
      <div id="session-manager-area" className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div ref={qrContainerRef} className="">
          <SessionManager ref={sessionManagerRef} currentUser={propCurrentUser} />
        </div>

        <div className="bg-theme-card rounded-xl shadow-sm border border-theme overflow-hidden">
          <div className="p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1 min-h-[32px]">
                <h3 className="font-semibold text-theme-main">Registros Recientes</h3>
              </div>
              <div className="h-[350px] overflow-y-auto pr-2 -mr-2">
                {userLogs.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 italic">No hay registros recientes</div>
                ) : (
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-theme-muted uppercase bg-theme-base">
                      <tr>
                        <th className="px-6 py-3">Hora</th>
                        <th className="px-6 py-3">Tipo</th>
                        <th className="px-6 py-3">Destino</th>
                        <th className="px-6 py-3">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userLogs.slice().reverse().map((log) => {
                        const messageType = log.messageType || 'single';
                        const getTypeLabel = (type: string) => {
                          switch (type) {
                            case 'auto-reply': return { label: 'Auto-respuesta', color: 'bg-purple-100 text-purple-700' };
                            case 'bulk': return { label: 'Masivo', color: 'bg-blue-100 text-blue-700' };
                            case 'group': return { label: 'Grupo', color: 'bg-indigo-100 text-indigo-700' };
                            case 'media': return { label: 'Multimedia', color: 'bg-pink-100 text-pink-700' };
                            default: return { label: 'Individual', color: 'bg-slate-100 text-theme-main' };
                          }
                        };
                        const typeInfo = getTypeLabel(messageType);

                        return (
                          <tr key={log.id} className="border-b border-theme hover:bg-theme-base">
                            <td className="px-6 py-4 font-mono text-theme-muted">
                              {log.timestamp.toLocaleTimeString()}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${typeInfo.color}`}>
                                {typeInfo.label}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-theme-main">{log.target}</td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${log.status === 'sent' ? 'bg-primary-100 text-primary-700' :
                                log.status === 'failed' ? 'bg-red-100 text-red-700' :
                                  'bg-yellow-100 text-yellow-700'
                                }`}>
                                {log.status === 'sent' ? 'ENVIADO' : log.status === 'failed' ? 'FALLIDO' : 'PENDIENTE'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};