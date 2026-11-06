import React from 'react';
import { PROVIDER_KIND_META } from '../../lib/constants';
import type { ProviderKind } from '../../types/domain';

export function ProviderLogo({
  kind,
  className = 'w-5 h-5',
}: {
  kind: ProviderKind;
  className?: string;
}) {
  switch (kind) {
    case 'gdrive':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path d="M8.5 3.5L15.5 3.5L22 14.5H15L8.5 3.5Z" fill="#FBBC04" />
          <path d="M2 14.5L8.5 3.5L12 9.5L5.5 20.5L2 14.5Z" fill="#34A853" />
          <path d="M5.5 20.5L9 14.5H22L18.5 20.5H5.5Z" fill="#4285F4" />
        </svg>
      );
    case 'onedrive':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path
            d="M17.5 18H6.5C4.01 18 2 15.99 2 13.5C2 11.27 3.63 9.42 5.77 9.06C6.81 6.67 9.21 5 12 5C15.48 5 18.36 7.61 18.76 10.98C20.59 11.45 22 13.09 22 15.05C22 16.68 20.68 18 19.05 18H17.5Z"
            fill="#0078D4"
          />
        </svg>
      );
    case 'dropbox':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path
            d="M7 3L2 6.5L7 10L12 6.5L7 3ZM17 3L12 6.5L17 10L22 6.5L17 3ZM2 13.5L7 17L12 13.5L7 10L2 13.5ZM17 10L12 13.5L17 17L22 13.5L17 10ZM7 18.2L12 21.5L17 18.2L12 14.8L7 18.2Z"
            fill="#0061FF"
          />
        </svg>
      );
    case 'box':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <rect x="2" y="4" width="20" height="16" rx="4" fill="#0061D5" />
          <circle cx="9.5" cy="12.5" r="2.7" stroke="white" strokeWidth="1.8" />
          <path d="M14.5 9.8L18.5 15.2M18.5 9.8L14.5 15.2" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'pcloud':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path
            d="M17.5 18.5H7C4.5 18.5 2.5 16.5 2.5 14C2.5 11.8 4.1 9.9 6.2 9.6C7.3 7.2 9.7 5.5 12.5 5.5C16.2 5.5 19.2 8.3 19.5 11.9C21 12.5 22 13.9 22 15.6C22 17.2 20.7 18.5 19.1 18.5H17.5Z"
            fill="#0D99FF"
          />
          <text x="9" y="15.5" fill="white" fontSize="8" fontWeight="bold" fontFamily="sans-serif">
            p
          </text>
        </svg>
      );
    case 's3':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path d="M12 2L20 6.5V17.5L12 22L4 17.5V6.5L12 2Z" fill="#FF9900" />
          <path d="M12 6L16.5 8.5V15.5L12 18L7.5 15.5V8.5L12 6Z" fill="#232F3E" />
        </svg>
      );
    case 'r2':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path
            d="M17.8 18H6.5C4.3 18 2.5 16.2 2.5 14C2.5 12 4 10.3 6 10.1C7.1 7.4 9.7 5.5 12.8 5.5C16.6 5.5 19.7 8.4 20 12.1C21.2 12.7 22 14 22 15.4C22 16.8 20.8 18 19.4 18H17.8Z"
            fill="#F38020"
          />
        </svg>
      );
    default: {
      const meta = PROVIDER_KIND_META[kind] ?? PROVIDER_KIND_META.local;
      return (
        <div
          className={`${className} rounded-md flex items-center justify-center text-[10px] font-bold text-white shrink-0`}
          style={{ backgroundColor: meta.badgeColor || '#0071E3' }}
          aria-hidden="true"
        >
          {meta.shortLabel.slice(0, 2).toUpperCase()}
        </div>
      );
    }
  }
}
