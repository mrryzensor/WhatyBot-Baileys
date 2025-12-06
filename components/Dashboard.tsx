import React, { useState, useEffect, useRef } from 'react';
import { Smartphone, Wifi, Activity, CheckCircle, XCircle, Crown, Gift, Zap, TrendingUp, AlertCircle } from 'lucide-react';
import { MessageLog } from '../types';
import { getCurrentUser, getUserStats } from '../services/usersApi';
import { getSubscriptionLimits } from '../services/usersApi';

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

export const Dashboard: React.FC<DashboardPropsWithUser> = ({ isConnected, logs, qrCode, onInitialize, onResetSession, isInitializing, socketStatus, currentUserId, currentUser: propCurrentUser, connectedPhone }) => {
  console.log('Dashboard render:', { isConnected, hasQrCode: !!qrCode, qrCodeLength: qrCode?.length, isInitializing, socketStatus });
  
  const [userInfo, setUserInfo] = useState<any>(null);
  const [subscriptionLimits, setSubscriptionLimits] = useState<any[]>([]);
  const [userStats, setUserStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const qrContainerRef = useRef<HTMLDivElement>(null);

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

  const handleInitializeAndScroll = () => {
    onInitialize();
    // Scroll to QR container after a short delay to allow QR to render
    setTimeout(() => {
      qrContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 500);
  };

  return (
    <div className="space-y-6">
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Resumen del Sistema</h2>
          <p className="text-slate-500">Estado en tiempo real de tu instancia WhatyBot.</p>
        </div>
        <div 
          onClick={handleInitializeAndScroll}
          className={`text-xs px-3 py-1 rounded-full cursor-pointer transition-all hover:opacity-80 ${socketStatus === 'Connected' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
          title="Haz clic para conectar WhatsApp y generar QR"
        >
          Socket: {socketStatus || (isConnected ? 'Conectado' : 'Desconectado')}
        </div>
      </header>

      {/* Subscription Info Card */}
      {!loading && userInfo && subscriptionLimit && (
        <div className={`bg-white rounded-xl shadow-sm border-2 p-6 ${getSubscriptionColor(subscriptionType).split(' ')[0]} border-${subscriptionType === 'administrador' ? 'yellow' : subscriptionType === 'pro' ? 'blue' : subscriptionType === 'elite' ? 'purple' : 'green'}-300`}>
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              {getSubscriptionIcon(subscriptionType)}
              <div>
                <h3 className="text-lg font-bold text-slate-800 capitalize">{subscriptionType}</h3>
                <p className="text-sm text-slate-600">
                  {userInfo.subscription_start_date && userInfo.subscription_end_date ? (
                    <>
                      Válido hasta: {formatDate(userInfo.subscription_end_date)}
                      {isSubscriptionExpired(userInfo.subscription_end_date) && (
                        <span className="ml-2 text-red-600 font-semibold">(Expirada)</span>
                      )}
                    </>
                  ) : (
                    'Suscripción permanente'
                  )}
                </p>
              </div>
            </div>
            {subscriptionLimit.price > 0 && (
              <div className="text-right">
                <p className="text-xs text-slate-500">Precio</p>
                <p className="text-lg font-bold text-slate-800">${subscriptionLimit.price}/mes</p>
              </div>
            )}
          </div>

          {/* Messages Usage */}
          <div className="mt-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-slate-700">Mensajes del mes</span>
              <span className="text-sm font-semibold text-slate-800">
                {isUnlimited ? (
                  <span className="text-green-600">{currentMonthCount} / Ilimitado</span>
                ) : (
                  `${currentMonthCount} / ${messagesLimit.toLocaleString()}`
                )}
              </span>
            </div>
            {!isUnlimited && messagesLimit > 0 && (
              <>
                <div className="w-full bg-slate-200 rounded-full h-3 mb-2">
                  <div
                    className={`h-3 rounded-full transition-all ${
                      usagePercentage >= 90 ? 'bg-red-500' :
                      usagePercentage >= 70 ? 'bg-orange-500' :
                      'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(100, usagePercentage)}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className={`font-semibold ${
                    messagesRemaining === 0 ? 'text-red-600' :
                    messagesRemaining <= messagesLimit * 0.1 ? 'text-orange-600' :
                    'text-green-600'
                  }`}>
                    {messagesRemaining === 0 ? (
                      <span className="flex items-center gap-1">
                        <AlertCircle size={14} />
                        Límite alcanzado
                      </span>
                    ) : (
                      `${messagesRemaining} mensajes restantes`
                    )}
                  </span>
                  <span className="text-slate-500">
                    {usagePercentage.toFixed(1)}% utilizado
                  </span>
                </div>
              </>
            )}
            {isUnlimited && (
              <div className="mt-2">
                <p className="text-sm font-medium text-green-600">✓ Mensajes ilimitados</p>
                <p className="text-xs text-slate-500 mt-1">No hay restricciones de envío</p>
              </div>
            )}
          </div>

          {/* Subscription Details */}
          <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-500">Duración</p>
              <p className="font-semibold text-slate-800">
                {subscriptionLimit.duration ? `${subscriptionLimit.duration} día(s)` : 'Permanente'}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Límite mensual</p>
              <p className="font-semibold text-slate-800">
                {messagesLimit === Infinity ? 'Ilimitado' : `${messagesLimit.toLocaleString()} mensajes`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div 
          onClick={handleInitializeAndScroll}
          className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4 cursor-pointer transition-all hover:shadow-md hover:scale-[1.02]"
          title="Haz clic para conectar WhatsApp y generar QR"
        >
          <div className={`p-4 rounded-full ${isConnected ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
            <Wifi size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Estado del Cliente</p>
            <h3 className={`text-xl font-bold ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
              {isConnected
                ? connectedPhone
                  ? `Conectado: ${formatPhone(connectedPhone)}`
                  : 'Conectado'
                : 'Desconectado - Conectar'}
            </h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="p-4 rounded-full bg-blue-100 text-blue-600">
            <CheckCircle size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Mensajes Enviados</p>
            <h3 className="text-xl font-bold text-slate-800">{sentCountFromDB}</h3>
            {sentCountFromDB !== sentCountFromLogs && (
              <p className="text-xs text-slate-400 mt-1">
                ({sentCountFromLogs} en registros recientes)
              </p>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="p-4 rounded-full bg-orange-100 text-orange-600">
            <Activity size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Estado de la Cola</p>
            <h3 className="text-xl font-bold text-slate-800">{userLogs.length > 0 ? 'Activa' : 'Inactiva'}</h3>
          </div>
        </div>
      </div>

      {/* Connection Area / QR Code */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div ref={qrContainerRef} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
              <Smartphone size={20} /> Conexión del Dispositivo
            </h3>
          </div>
          <div className="p-8 flex flex-col items-center justify-center min-h-[300px]">
            {isConnected ? (
              <div className="text-center">
                <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-green-600">
                  <CheckCircle size={48} />
                </div>
                <h4 className="text-lg font-bold text-slate-800">WhatsApp está Listo</h4>
                <p className="text-slate-500 mt-2">La sesión está activa. Puedes comenzar a enviar mensajes.</p>
                {onResetSession && (
                  <button
                    onClick={onResetSession}
                    className="mt-4 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    Desconectar / Cambiar número
                  </button>
                )}
              </div>
            ) : qrCode ? (
              <div className="text-center">
                <img src={qrCode} alt="QR Code" className="w-64 h-64 mx-auto mb-4 border-4 border-slate-200 rounded-lg" />
                <p className="text-slate-600 font-medium">Escanea este código QR con WhatsApp</p>
                <p className="text-slate-500 text-sm mt-2">Abre WhatsApp &gt; Dispositivos Vinculados &gt; Vincular un dispositivo</p>
              </div>
            ) : (
              <div className="text-center">
                <div className="w-64 h-64 bg-slate-100 mx-auto rounded-lg flex items-center justify-center mb-4 border-2 border-dashed border-slate-300">
                  <Smartphone size={48} className="text-slate-300" />
                </div>
                <p className="text-slate-600 font-medium mb-4">
                  {isInitializing ? 'Conectando...' : 'El cliente de WhatsApp está detenido'}
                </p>
                <button
                  onClick={onInitialize}
                  disabled={isInitializing}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 mx-auto"
                >
                  {isInitializing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Iniciando...
                    </>
                  ) : (
                    <>
                      <Wifi size={18} />
                      Conectar WhatsApp
                    </>
                  )}
                </button>
                <button
                  onClick={onResetSession}
                  disabled={isInitializing}
                  className="mt-3 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Limpiar sesión y generar nuevo QR
                </button>
                {!isInitializing && (
                  <p className="text-slate-400 text-xs mt-3">
                    💡 Si tienes una sesión guardada, se reconectará automáticamente
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800">Registros Recientes</h3>
          </div>
          <div className="flex-1 overflow-y-auto max-h-[300px] p-0">
            {userLogs.length === 0 ? (
              <div className="p-8 text-center text-slate-400 italic">No hay registros recientes</div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50">
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
                        default: return { label: 'Individual', color: 'bg-slate-100 text-slate-700' };
                      }
                    };
                    const typeInfo = getTypeLabel(messageType);
                    
                    return (
                      <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-6 py-4 font-mono text-slate-500">
                          {log.timestamp.toLocaleTimeString()}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${typeInfo.color}`}>
                            {typeInfo.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-700">{log.target}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${log.status === 'sent' ? 'bg-green-100 text-green-700' :
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
  );
};