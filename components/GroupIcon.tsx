import React from 'react';

interface GroupIconProps {
  image?: string;
  name: string;
  size?: number;
  className?: string;
}

export const GroupIcon: React.FC<GroupIconProps> = ({ 
  image, 
  name, 
  size = 40,
  className = '' 
}) => {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map(word => word.charAt(0).toUpperCase())
    .join('')
    .substring(0, 2);

  const colors = [
    'from-blue-500 to-blue-600',
    'from-primary-500 to-primary-600',
    'from-purple-500 to-purple-600',
    'from-pink-500 to-pink-600',
    'from-orange-500 to-orange-600',
    'from-indigo-500 to-indigo-600',
    'from-red-500 to-red-600',
    'from-teal-500 to-teal-600',
  ];

  // Generate consistent color based on name
  const colorIndex = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
  const gradientClass = colors[colorIndex];

  if (image) {
    return (
      <div className={`relative ${className}`} style={{ width: size, height: size }}>
        <img 
          src={image} 
          alt={name}
          className="w-full h-full rounded-full object-cover border-2 border-white shadow-md"
          onError={(e) => {
            // Fallback to SVG if image fails to load
            e.currentTarget.style.display = 'none';
            const parent = e.currentTarget.parentElement;
            if (parent) {
              const svg = parent.querySelector('.group-icon-svg');
              if (svg) (svg as HTMLElement).style.display = 'block';
            }
          }}
        />
        {/* Fallback SVG (hidden by default) */}
        <div 
          className={`group-icon-svg hidden absolute inset-0 rounded-full bg-gradient-to-br ${gradientClass} flex items-center justify-center text-white font-semibold shadow-md border-2 border-white`}
          style={{ fontSize: size * 0.4 }}
        >
          {initials}
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`relative rounded-full bg-gradient-to-br ${gradientClass} flex items-center justify-center text-white font-semibold shadow-lg border-2 border-white/50 overflow-hidden ${className}`}
      style={{ 
        width: size, 
        height: size,
        fontSize: size * 0.4 
      }}
    >
      {/* Decorative SVG pattern - Modern geometric design */}
      <svg 
        className="absolute inset-0 w-full h-full opacity-30"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id={`gradient-${name}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="white" stopOpacity="0.4" />
            <stop offset="50%" stopColor="white" stopOpacity="0.1" />
            <stop offset="100%" stopColor="white" stopOpacity="0.3" />
          </linearGradient>
          <pattern id={`pattern-${name.replace(/\s/g, '-')}`} x="0" y="0" width="25" height="25" patternUnits="userSpaceOnUse">
            <circle cx="12.5" cy="12.5" r="1.5" fill="white" opacity="0.4" />
            <circle cx="0" cy="0" r="1" fill="white" opacity="0.2" />
            <circle cx="25" cy="25" r="1" fill="white" opacity="0.2" />
          </pattern>
        </defs>
        {/* Background pattern */}
        <rect width="100" height="100" fill={`url(#pattern-${name.replace(/\s/g, '-')})`} />
        {/* Overlay gradient */}
        <rect width="100" height="100" fill={`url(#gradient-${name})`} />
        {/* Decorative circles */}
        <circle cx="20" cy="20" r="8" fill="white" opacity="0.1" />
        <circle cx="80" cy="80" r="10" fill="white" opacity="0.1" />
        <circle cx="50" cy="10" r="6" fill="white" opacity="0.15" />
      </svg>
      
      {/* Initials text with better styling */}
      <span className="relative z-10 drop-shadow-md font-bold" style={{ letterSpacing: '0.5px' }}>
        {initials}
      </span>
    </div>
  );
};

