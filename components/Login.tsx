import React, { useState, useEffect } from 'react';
import { Mail, Lock, LogIn, Sparkles } from 'lucide-react';
import { login, register } from '../services/authApi';
import { getSubscriptionLimits } from '../services/usersApi';
import Confetti from 'react-confetti';

interface LoginProps {
  onLoginSuccess: (user: any) => void;
}

interface NewUserModalProps {
  email: string;
  password: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const NewUserModal: React.FC<NewUserModalProps> = ({ email, password, onConfirm, onCancel }) => {
  const [freePlanInfo, setFreePlanInfo] = useState<string>('Gratuito (50 mensajes, 1 mes)');

  useEffect(() => {
    const loadFreePlanInfo = async () => {
      try {
        const response = await getSubscriptionLimits();
        if (response.success) {
          const freePlan = response.limits.find(limit => limit.type === 'gratuito');
          if (freePlan) {
            const messagesText = freePlan.messages === Infinity || freePlan.messages === null || freePlan.messages === undefined 
              ? 'Ilimitados' 
              : `${freePlan.messages.toLocaleString()} mensajes`;
            const durationText = freePlan.duration 
              ? `${freePlan.duration} día(s)` 
              : 'Permanente';
            setFreePlanInfo(`Gratuito (${messagesText}, ${durationText})`);
          }
        }
      } catch (error) {
        console.error('Error loading free plan info:', error);
      }
    };
    loadFreePlanInfo();
  }, []);
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-theme-card rounded-xl shadow-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-100 rounded-full">
            <Mail className="text-blue-600" size={24} />
          </div>
          <h3 className="text-xl font-bold text-theme-main">Cuenta no encontrada</h3>
        </div>
        
        <div className="mb-6">
          <p className="text-theme-muted mb-4">
            No existe una cuenta con el correo <strong>{email}</strong>.
          </p>
          <p className="text-theme-muted mb-2">
            Se creará una nueva cuenta con:
          </p>
          <div className="bg-theme-base rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Mail size={16} className="text-theme-muted" />
              <span className="text-sm text-theme-main"><strong>Email:</strong> {email}</span>
            </div>
            <div className="flex items-center gap-2">
              <Lock size={16} className="text-theme-muted" />
              <span className="text-sm text-theme-main"><strong>Contraseña:</strong> {password.replace(/./g, '•')}</span>
            </div>
            <div className="mt-3 pt-3 border-t border-theme">
              <p className="text-xs text-theme-muted">
                <strong>Plan:</strong> {freePlanInfo}
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-theme rounded-lg hover:bg-theme-base transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            Crear cuenta
          </button>
        </div>
      </div>
    </div>
  );
};

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showNewUserModal, setShowNewUserModal] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [generalError, setGeneralError] = useState('');

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);
    if (value && !validateEmail(value)) {
      setEmailError('Por favor ingresa un correo electrónico válido');
    } else {
      setEmailError('');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Limpiar errores previos
    setGeneralError('');
    setPasswordError('');
    
    if (!email || !password) {
      if (!email) setEmailError('El correo electrónico es requerido');
      if (!password) setPasswordError('La contraseña es requerida');
      return;
    }

    if (!validateEmail(email)) {
      setEmailError('Por favor ingresa un correo electrónico válido');
      return;
    }

    setLoading(true);
    try {
      const response = await login(email, password);
      if (response.success) {
        // Guardar sesión
        localStorage.setItem('user', JSON.stringify(response.user));
        localStorage.setItem('isAuthenticated', 'true');
        onLoginSuccess(response.user);
      }
    } catch (error: any) {
      // Si el usuario no existe, mostrar modal de confirmación
      if (error.response?.status === 404 || error.message?.includes('no existe') || error.response?.data?.error?.includes('no encontrado')) {
        setShowNewUserModal(true);
      } else if (error.response?.status === 401 || error.response?.data?.error?.includes('incorrecta')) {
        // Contraseña incorrecta
        setPasswordError('La contraseña no es correcta');
      } else {
        setGeneralError(error.message || error.response?.data?.error || 'Error al iniciar sesión');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    setLoading(true);
    setGeneralError('');
    try {
      const response = await register(email, password);
      if (response.success) {
        setShowNewUserModal(false);
        setShowConfetti(true);
        
        // Guardar sesión
        localStorage.setItem('user', JSON.stringify(response.user));
        localStorage.setItem('isAuthenticated', 'true');
        
        // Ocultar confetti después de 3 segundos
        setTimeout(() => {
          setShowConfetti(false);
          onLoginSuccess(response.user);
        }, 3000);
      }
    } catch (error: any) {
      setGeneralError(error.message || error.response?.data?.error || 'Error al crear la cuenta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-blue-50 to-purple-50 flex items-center justify-center p-4">
      {showConfetti && (
        <Confetti
          width={window.innerWidth}
          height={window.innerHeight}
          recycle={false}
          numberOfPieces={500}
        />
      )}
      
      <div className="bg-theme-card rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-full mb-4">
            <Sparkles className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-bold text-theme-main mb-2">WhatyBot DxS</h1>
          <p className="text-theme-muted">Inicia sesión para continuar</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-theme-main mb-2">
              Correo Electrónico
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
              <input
                type="email"
                value={email}
                onChange={handleEmailChange}
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                  emailError ? 'border-red-300' : 'border-theme'
                }`}
                placeholder="tu@correo.com"
                disabled={loading}
              />
            </div>
            {emailError && (
              <p className="mt-1 text-sm text-red-600">{emailError}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-theme-main mb-2">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError(''); // Limpiar error al escribir
                }}
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                  passwordError ? 'border-red-300' : 'border-theme'
                }`}
                placeholder="••••••••"
                disabled={loading}
              />
            </div>
            {passwordError && (
              <p className="mt-1 text-sm text-red-600">{passwordError}</p>
            )}
          </div>
          
          {generalError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-600">{generalError}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !!emailError}
            className="w-full bg-primary-600 text-white py-3 rounded-lg font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Iniciando sesión...
              </>
            ) : (
              <>
                <LogIn size={20} />
                Iniciar Sesión
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-xs text-theme-muted">
            Si no tienes cuenta, inicia sesión con tu correo y se creará automáticamente
          </p>
        </div>
      </div>

      {showNewUserModal && (
        <NewUserModal
          email={email}
          password={password}
          onConfirm={handleCreateAccount}
          onCancel={() => {
            setShowNewUserModal(false);
            setLoading(false);
          }}
        />
      )}
    </div>
  );
};

