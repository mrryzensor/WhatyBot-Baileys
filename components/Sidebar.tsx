import React from 'react';
import { LayoutDashboard, MessageSquare, Users, Settings, LogOut, Bot, Send, Clock, UserCog } from 'lucide-react';
import { Tab } from '../types';

interface SidebarProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  onLogout?: () => void;
  currentUser?: any;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, onLogout, currentUser }) => {
  const isAdmin = currentUser?.subscription_type === 'administrador';
  
  const navItems = [
    { id: Tab.DASHBOARD, label: 'Panel Principal', icon: LayoutDashboard },
    { id: Tab.SINGLE_SENDER, label: 'Envío Individual', icon: Send },
    { id: Tab.MASS_SENDER, label: 'Envíos Masivos', icon: MessageSquare },
    { id: Tab.GROUPS, label: 'Gestor de Grupos', icon: Users },
    { id: Tab.SCHEDULED, label: 'Mensajes Programados', icon: Clock },
    { id: Tab.AUTO_REPLY, label: 'Bot Auto-Respuestas', icon: Bot },
    ...(isAdmin ? [{ id: Tab.USERS, label: 'Gestión de Usuarios', icon: UserCog }] : []),
    { id: Tab.SETTINGS, label: 'Configuración', icon: Settings },
  ];

  return (
    <div className="w-64 bg-slate-900 text-white flex flex-col h-screen fixed left-0 top-0 shadow-xl z-20">
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <span className="text-green-500">WhatyBot</span> DxS
        </h1>
        <p className="text-xs text-slate-400 mt-1">Panel de Automatización</p>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 text-left ${isActive
                  ? 'bg-green-600 text-white shadow-lg shadow-green-900/20'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
            >
              <Icon size={20} />
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <button 
          onClick={() => {
            if (onLogout) {
              onLogout();
            } else {
              localStorage.removeItem('user');
              localStorage.removeItem('isAuthenticated');
              window.location.reload();
            }
          }}
          className="flex items-center gap-2 text-red-400 hover:text-red-300 transition-colors w-full px-4 py-2 rounded-lg hover:bg-slate-800"
        >
          <LogOut size={18} />
          <span>Cerrar Sesión</span>
        </button>
      </div>
    </div>
  );
};