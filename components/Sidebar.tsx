import React, { useState } from 'react';
import { LayoutDashboard, MessageSquare, Users, Settings, LogOut, Bot, Send, Clock, UserCog, UserCircle, Menu as MenuIcon, Search, X } from 'lucide-react';
import { Tab } from '../types';

interface SidebarProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  onLogout?: () => void;
  currentUser?: any;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, onLogout, currentUser }) => {
  const isAdmin = (currentUser?.subscription_type || '').toString().toLowerCase() === 'administrador';
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems = [
    { id: Tab.DASHBOARD, label: 'Panel Principal', icon: LayoutDashboard },
    { id: Tab.SINGLE_SENDER, label: 'Envío Individual', icon: Send },
    { id: Tab.MASS_SENDER, label: 'Envíos Masivos', icon: MessageSquare },
    { id: Tab.CONTACTS, label: 'Contactos', icon: UserCircle },
    { id: Tab.GROUPS, label: 'Gestor de Grupos', icon: Users },
    { id: Tab.SCHEDULED, label: 'Mensajes Programados', icon: Clock },
    { id: Tab.AUTO_REPLY, label: 'Bot Auto-Respuestas', icon: Bot },
    { id: Tab.MENUS, label: 'Menús Interactivos', icon: MenuIcon },
    ...(isAdmin ? [{ id: Tab.USERS, label: 'Gestión de Usuarios', icon: UserCog }] : []),
    { id: Tab.SETTINGS, label: 'Configuración', icon: Settings },
  ];

  // Filtrar items basado en la búsqueda
  const filteredItems = navItems.filter(item =>
    item.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false); // Cerrar menú en móvil al seleccionar
  };

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    } else {
      localStorage.removeItem('user');
      localStorage.removeItem('isAuthenticated');
      window.location.reload();
    }
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      {/* Botón Flotante para Móvil */}
      <button
        onClick={() => setIsMobileMenuOpen(true)}
        className="fixed bottom-6 left-6 z-50 lg:hidden bg-primary-600 text-white p-4 rounded-full shadow-2xl hover:bg-primary-700 transition-all hover:scale-110 active:scale-95"
        aria-label="Abrir menú"
      >
        <MenuIcon size={24} />
      </button>

      {/* Backdrop/Overlay para Móvil */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        w-64 bg-theme-sidebar text-theme-main flex flex-col h-screen shadow-xl z-50
        fixed left-0 top-0
        transition-transform duration-300 ease-in-out
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Header */}
        <div className="p-6 border-b border-theme flex items-center justify-between">
          <div className="flex-1">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <span className="text-primary-500">WhatyBot</span> DxS
            </h1>
            <p className="text-xs text-theme-muted mt-1">Panel de Automatización</p>
          </div>
          {/* Botón cerrar para móvil */}
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="lg:hidden text-theme-muted hover:text-theme-main transition-colors p-2 hover:bg-theme-base rounded-lg"
            aria-label="Cerrar menú"
          >
            <X size={20} />
          </button>
        </div>

        {/* Buscador */}
        <div className="px-4 pt-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" size={18} />
            <input
              type="text"
              placeholder="Buscar menú..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-theme-base text-theme-main placeholder-theme-muted rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted hover:text-theme-main transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18"></path>
                  <path d="m6 6 12 12"></path>
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Navegación con scroll */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800">
          {filteredItems.length > 0 ? (
            filteredItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleTabChange(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 text-left ${isActive
                    ? 'bg-primary-600 text-white shadow-lg shadow-primary-900/20'
                    : 'text-theme-muted hover:bg-theme-base hover:text-theme-main'
                    }`}
                >
                  <Icon size={20} />
                  <span className="font-medium">{item.label}</span>
                </button>
              );
            })
          ) : (
            <div className="text-center py-8 text-theme-muted text-sm">
              <Search size={32} className="mx-auto mb-2 opacity-50" />
              <p>No se encontraron resultados</p>
            </div>
          )}
        </nav>

        {/* Footer - Cerrar Sesión */}
        <div className="p-4 border-t border-theme">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-red-400 hover:text-red-300 transition-colors w-full px-4 py-2 rounded-lg hover:bg-slate-800"
          >
            <LogOut size={18} />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </div>
    </>
  );
};