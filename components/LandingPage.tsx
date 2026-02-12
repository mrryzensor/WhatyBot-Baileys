import React, { useEffect } from 'react';
import { Bot, Terminal, Shield, Zap, RefreshCw, MessageSquare } from 'lucide-react';

interface LandingPageProps {
    onLoginClick: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLoginClick }) => {
    useEffect(() => {
        // Force purple theme for landing
        document.documentElement.style.setProperty('--primary-500', '147 51 234'); // Purple-600 RGB
        document.documentElement.style.setProperty('--primary-600', '126 34 206');
        document.documentElement.style.setProperty('--primary-50', '250 245 255');
    }, []);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col items-center justify-center text-white relative overflow-hidden">

            {/* Background Effects */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden opacity-20 pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500 rounded-full blur-[128px] animate-pulse"></div>
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500 rounded-full blur-[128px] animate-pulse delay-1000"></div>
            </div>

            <div className="z-10 container mx-auto px-4 text-center max-w-5xl">

                {/* Header/Logo Area */}
                <div className="mb-12 flex justify-center">
                    <div className="relative">
                        <div className="absolute inset-0 bg-purple-500 blur-xl opacity-50 rounded-full"></div>
                        <div className="relative bg-slate-900/50 p-6 rounded-2xl border border-purple-500/30 backdrop-blur-sm">
                            <Bot size={64} className="text-purple-400" />
                        </div>
                    </div>
                </div>

                <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 drop-shadow-sm">
                    WhatyBot v2.0
                </h1>

                <p className="text-xl md:text-2xl text-purple-200 mb-12 max-w-2xl mx-auto font-light">
                    La plataforma más avanzada para automatización de WhatsApp, ahora desplegada en la nube con Railway.
                </p>

                {/* Feature Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16 text-left">
                    <FeatureCard
                        icon={<Zap size={24} className="text-yellow-400" />}
                        title="Rendimiento Cloud"
                        desc="Ejecutándose en servidores de alto rendimiento con latencia mínima."
                    />
                    <FeatureCard
                        icon={<Shield size={24} className="text-green-400" />}
                        title="Sesiones Persistentes"
                        desc="Tus sesiones de WhatsApp se mantienen activas 24/7 sin interrupciones."
                    />
                    <FeatureCard
                        icon={<Bot size={24} className="text-blue-400" />}
                        title="IA Integrada"
                        desc="Auto-respuestas inteligentes y menús interactivos configurables."
                    />
                </div>

                {/* Login Button */}
                <div className="flex flex-col items-center gap-4">
                    <button
                        onClick={onLoginClick}
                        className="group relative px-8 py-4 bg-purple-600 hover:bg-purple-700 rounded-xl font-bold text-lg shadow-lg hover:shadow-purple-500/25 transition-all transform hover:-translate-y-1 active:translate-y-0 w-full md:w-auto min-w-[200px]"
                    >
                        <span className="flex items-center justify-center gap-3">
                            Ingresar al Panel
                            <Terminal size={20} className="group-hover:translate-x-1 transition-transform" />
                        </span>

                        {/* Button Glow */}
                        <div className="absolute inset-0 rounded-xl ring-2 ring-white/20 group-hover:ring-white/40 transition-all"></div>
                    </button>

                    <p className="text-sm text-slate-400">
                        Acceso restringido a usuarios autorizados
                    </p>
                </div>

            </div>

            {/* Footer */}
            <div className="absolute bottom-6 text-slate-500 text-sm font-medium">
                Powered by Railway & Baileys
            </div>
        </div>
    );
};

const FeatureCard = ({ icon, title, desc }: { icon: any, title: string, desc: string }) => (
    <div className="bg-slate-800/40 backdrop-blur-md p-6 rounded-xl border border-white/5 hover:border-purple-500/30 transition-colors group">
        <div className="mb-4 bg-slate-900/50 w-12 h-12 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
            {icon}
        </div>
        <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
        <p className="text-slate-400 text-sm">{desc}</p>
    </div>
);
