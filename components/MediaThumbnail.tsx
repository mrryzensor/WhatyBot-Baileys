import React, { useState, useEffect } from 'react';
import { Image, Video, FileText, File } from 'lucide-react';
import { getApiUrl } from '../services/api';

interface MediaThumbnailProps {
    src?: string; // For previews (blob/data URLs) or full HTTP URLs
    mediaPath?: string; // For backend paths (relative)
    type: 'image' | 'video' | 'document' | 'audio' | string;
    caption?: string;
    fileName?: string;
    className?: string;
    onClick?: () => void;
}

export const MediaThumbnail: React.FC<MediaThumbnailProps> = ({
    src,
    mediaPath,
    type,
    caption,
    fileName,
    className = "",
    onClick
}) => {
    const [imageError, setImageError] = useState(false);

    useEffect(() => {
        setImageError(false);
    }, [src, mediaPath]);

    // Determine the type normalized
    let normalizedType: 'image' | 'video' | 'document' = 'document';
    const safeType = type || '';
    if (safeType.includes('image') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].some(ext => (fileName || src || mediaPath)?.toLowerCase().endsWith(ext))) {
        normalizedType = 'image';
    } else if (safeType.includes('video') || ['mp4', 'avi', 'mov', 'webm', 'mkv', 'flv', 'wmv'].some(ext => (fileName || src || mediaPath)?.toLowerCase().endsWith(ext))) {
        normalizedType = 'video';
    }

    // Construct the full source URL
    let fullSrc = src;
    if (!fullSrc && mediaPath) {
        if (mediaPath.startsWith('http') || mediaPath.startsWith('blob:') || mediaPath.startsWith('data:')) {
            fullSrc = mediaPath;
        } else {
            const cleanPath = mediaPath.replace(/^.*[\\/]/, '');
            fullSrc = `${getApiUrl()}/uploads/${cleanPath}`;
        }
    }

    // Helper to render icon for non-image types
    const renderIcon = () => {
        if (normalizedType === 'video') {
            return (
                <div className="flex flex-col items-center justify-center text-theme-muted">
                    <Video size={32} className="mb-2 text-purple-500" />
                    <span className="text-xs font-medium">Video</span>
                </div>
            );
        } else {
            return (
                <div className="flex flex-col items-center justify-center text-theme-muted">
                    {/* Replicating the fallback UI requested by User */}
                    <File size={32} className="text-slate-400 mb-2" />
                    <span className="text-xs text-theme-muted text-center px-2 truncate max-w-full">
                        {fileName || 'Archivo'}
                    </span>
                </div>
            );
        }
    };

    return (
        <div
            className={`relative w-full h-32 bg-slate-100 rounded-lg overflow-hidden flex items-center justify-center border border-theme cursor-pointer ${className}`}
            onClick={onClick}
        >
            {normalizedType === 'image' && fullSrc && !imageError ? (
                <>
                    <img
                        src={fullSrc}
                        alt={caption || fileName || "Media preview"}
                        className="w-full h-full object-cover"
                        onError={() => setImageError(true)}
                    />
                    {caption && (
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                            <p className="text-xs text-white line-clamp-1">{caption}</p>
                        </div>
                    )}
                </>
            ) : (
                renderIcon()
            )}

            {/* If video, try to show video element if src exists, otherwise fallback to icon */}
            {normalizedType === 'video' && fullSrc && !imageError && (
                <video className="w-full h-full object-cover hidden">
                    <source src={fullSrc} />
                </video>
            )}
        </div>
    );
};
