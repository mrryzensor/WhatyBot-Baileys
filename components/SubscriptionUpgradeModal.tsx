import React, { useState, useEffect } from 'react';
import { X, Zap, TrendingUp, Crown, ArrowRight, MessageCircle, Loader, CheckCircle } from 'lucide-react';
import { SubscriptionLimit, SubscriptionContactLink, getSubscriptionContactLink } from '../services/usersApi';
import { sendMessage } from '../services/api';

interface SubscriptionUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlan: string;
  currentLimit: number;
  currentUsed: number;
  subscriptionLimits: SubscriptionLimit[];
  userEmail: string;
  subscriptionExpired?: boolean;
  subscriptionEndDate?: string;
  isConnected?: boolean;
}

export const SubscriptionUpgradeModal: React.FC<SubscriptionUpgradeModalProps> = ({
  isOpen,
  onClose,
  currentPlan,
  currentLimit,
  currentUsed,
  subscriptionLimits,
  userEmail,
  subscriptionExpired = false,
  subscriptionEndDate,
  isConnected = false
}) => {
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [contactLinks, setContactLinks] = useState<{ [key: string]: SubscriptionContactLink }>({});

  useEffect(() => {
    if (isOpen) {
      // Load contact links for all available plans (including free plan)
      const loadContactLinks = async () => {
        const availablePlans = subscriptionLimits.filter(
          limit => limit.type !== currentPlan && limit.type !== 'administrador'
        );
        
        const links: { [key: string]: SubscriptionContactLink } = {};
        for (const plan of availablePlans) {
          try {
            const response = await getSubscriptionContactLink(plan.type);
            if (response.success && response.link) {
              links[plan.type] = response.link;
            }
          } catch (error) {
            console.error(`Error loading contact link for ${plan.type}:`, error);
          }
        }
        setContactLinks(links);
      };
      loadContactLinks();
    }
  }, [isOpen, subscriptionLimits, currentPlan]);

  if (!isOpen) return null;

  const planOrder: Record<string, number> = {
    gratuito: 0,
    pro: 1,
    elite: 2,
    platino: 3,
    administrador: 99
  };

  const currentPlanKey = (currentPlan || '').toString().toLowerCase();
  const currentRank = planOrder[currentPlanKey] ?? 0;

  const availablePlans = subscriptionLimits.filter((limit) => {
    const type = (limit.type || '').toString().toLowerCase();
    if (!type) return false;
    if (type === 'administrador') return false;
    if (type === 'gratuito') return false;
    const rank = planOrder[type] ?? 0;
    return rank > currentRank;
  });

  const handleUpgrade = async (planType: string, planPrice: number) => {
    const planName = planType.charAt(0).toUpperCase() + planType.slice(1);
    const message = `Hola, deseo actualizar mi suscripción a ${planName} ($${planPrice}/mes). Mi correo es: ${userEmail}`;
    
    // Get contact link for this plan
    const contactLink = contactLinks[planType] || {
      subscriptionType: planType,
      contactType: 'whatsapp_number' as const,
      contactValue: '51977638887'
    };

    // Handle based on contact type
    if (contactLink.contactType === 'whatsapp_number' && isConnected) {
      // Send directly via WhatsApp if connected
      setSending(planType);
      try {
        await sendMessage(contactLink.contactValue, message);
        setSending(null);
        setSent(planType);
        // Close modal after showing success message
        setTimeout(() => {
          setSent(null);
          onClose();
        }, 3000);
      } catch (error) {
        console.error('Error sending message:', error);
        // Fallback to wa.me if direct send fails
        const whatsappUrl = `https://wa.me/${contactLink.contactValue}?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
        setSending(null);
      }
    } else if (contactLink.contactType === 'wa_link') {
      // Open wa.link
      window.open(contactLink.contactValue, '_blank');
    } else if (contactLink.contactType === 'payment_link') {
      // Open payment link
      window.open(contactLink.contactValue, '_blank');
    } else {
      // Fallback to wa.me
      const whatsappUrl = `https://wa.me/${contactLink.contactValue}?text=${encodeURIComponent(message)}`;
      window.open(whatsappUrl, '_blank');
    }
  };

  const getPlanIcon = (type: string) => {
    switch (type) {
      case 'pro': return <Zap className="text-blue-600" size={24} />;
      case 'elite': return <TrendingUp className="text-purple-600" size={24} />;
      case 'platino': return <Crown className="text-amber-600" size={24} />;
      default: return <Crown className="text-yellow-600" size={24} />;
    }
  };

  const getPlanColor = (type: string) => {
    switch (type) {
      case 'pro': return 'border-blue-300 bg-blue-50 hover:bg-blue-100';
      case 'elite': return 'border-purple-300 bg-purple-50 hover:bg-purple-100';
      case 'platino': return 'border-amber-300 bg-amber-50 hover:bg-amber-100';
      default: return 'border-yellow-300 bg-yellow-50 hover:bg-yellow-100';
    }
  };

  const getPlanName = (type: string) => {
    switch (type) {
      case 'pro': return 'Pro';
      case 'elite': return 'Elite';
      case 'platino': return 'Platino';
      default: return type.charAt(0).toUpperCase() + type.slice(1);
    }
  };

  const formatEndDate = (dateString?: string) => {
    if (!dateString) return null;
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  const formattedEndDate = formatEndDate(subscriptionEndDate);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-green-600 to-blue-600 p-8 rounded-t-2xl">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white hover:text-gray-200 transition-colors"
          >
            <X size={24} />
          </button>
          
          <div className="text-center text-white">
            <h2 className="text-3xl font-bold mb-2">
              {subscriptionExpired ? 'Tu suscripción está expirada' : 'Has alcanzado tu límite de mensajes'}
            </h2>
            {subscriptionExpired ? (
              <p className="text-lg opacity-90">
                {formattedEndDate ? `Venció el ${formattedEndDate}` : 'Tu plan ya no está activo.'}
              </p>
            ) : (
              <p className="text-lg opacity-90">
                Has usado {currentUsed} de {currentLimit} mensajes este mes
              </p>
            )}
            <div className="mt-4 bg-white/20 rounded-lg p-4 inline-block">
              <p className="text-sm font-medium">
                {subscriptionExpired
                  ? 'Actualiza tu plan para volver a enviar mensajes'
                  : 'Actualiza tu plan para continuar enviando mensajes ilimitados'}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          <div className="mb-6">
            <h3 className="text-xl font-semibold text-slate-800 mb-2">Planes disponibles</h3>
            <p className="text-slate-600">Selecciona el plan que mejor se adapte a tus necesidades</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {availablePlans.map((plan) => (
              <div
                key={plan.type}
                className={`border-2 rounded-xl p-6 transition-all cursor-pointer ${getPlanColor(plan.type)}`}
              >
                <div className="flex items-center gap-3 mb-4">
                  {getPlanIcon(plan.type)}
                  <div>
                    <h4 className="text-xl font-bold text-slate-800">{getPlanName(plan.type)}</h4>
                    <p className="text-sm text-slate-600">
                      ${plan.price} USD / mes
                    </p>
                  </div>
                </div>
                
                <div className="space-y-2 mb-6">
                  <div className="flex items-center gap-2 text-slate-700">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm">
                      {plan.messages === -1 || plan.messages === Infinity || plan.messages == null
                        ? 'Mensajes ilimitados'
                        : `${Number(plan.messages).toLocaleString()} mensajes por mes`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-700">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm">Soporte prioritario</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-700">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm">Renovación mensual automática</span>
                  </div>
                </div>

                <button
                  onClick={() => handleUpgrade(plan.type, plan.price)}
                  disabled={sending === plan.type || sent === plan.type}
                  className="w-full bg-gradient-to-r from-green-600 to-blue-600 text-white py-3 rounded-lg font-semibold hover:from-green-700 hover:to-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending === plan.type ? (
                    <>
                      <Loader size={20} className="animate-spin" />
                      <span>Enviando...</span>
                    </>
                  ) : sent === plan.type ? (
                    <>
                      <CheckCircle size={20} />
                      <span>¡Mensaje enviado!</span>
                    </>
                  ) : (
                    <>
                      <MessageCircle size={20} />
                      <span>Contactar para actualizar</span>
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>

          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <p className="text-sm text-slate-600 text-center">
              {isConnected 
                ? 'Al hacer clic en "Contactar para actualizar", se enviará el mensaje directamente desde la aplicación.'
                : 'Al hacer clic en "Contactar para actualizar", se abrirá WhatsApp con un mensaje pre-formateado.'
              }
              {' '}Nuestro equipo te ayudará a completar la actualización de tu suscripción.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

