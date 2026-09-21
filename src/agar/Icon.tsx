import type { CSSProperties, ReactNode } from 'react';

export type IconName = 'play' | 'eye' | 'settings' | 'sound' | 'muted' | 'help' | 'arrow' | 'chevron' | 'close' | 'trophy' | 'mouse' | 'split' | 'eject' | 'expand' | 'palette' | 'check' | 'pause' | 'home' | 'restart' | 'moon' | 'sun' | 'globe' | 'info' | 'keyboard' | 'target' | 'leaf' | 'users' | 'download';

const paths: Record<IconName, ReactNode> = {
  play: <path d="m9 5 11 7-11 7V5Z" />,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>,
  settings: <><path d="m9.2 3-.7 2.5-2.4.5-2-1.1-2.2 3.8 1.8 1.7-.3 2.5-1.6 1.6L4 18.2l2.6-.6 1.9 1.5.7 2.4h4.4l.7-2.4 2-1.5 2.5.6 2.2-3.7-1.7-1.8V10l1.7-1.8-2.2-3.6-2.5.7-2-1.5-.7-2.3Z" transform="translate(0 1) scale(.96)" /><circle cx="11.7" cy="12" r="3" /></>,
  sound: <><path d="m11 4-6 5H2v6h3l6 5V4ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" /></>,
  muted: <><path d="m11 4-6 5H2v6h3l6 5V4ZM16 9l6 6m0-6-6 6" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.3 9a2.8 2.8 0 0 1 5.5.8c0 1.6-2.8 1.8-2.8 3.7M12 17h.01" /></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  chevron: <path d="m7 10 5 5 5-5" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  trophy: <><path d="M8 3h8v5a4 4 0 0 1-8 0V3ZM8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4M12 12v6m-4 3h8m-7-3h6" /></>,
  mouse: <><rect x="6" y="2" width="12" height="20" rx="6" /><path d="M12 6v4" /></>,
  split: <><circle cx="6" cy="12" r="4" /><circle cx="18" cy="12" r="4" /><path d="m10 3 2 2 2-2m-4 18 2-2 2 2" /></>,
  eject: <><circle cx="7" cy="16" r="5" /><circle cx="18" cy="5" r="2" /><path d="m12 11 3-3m-2 0h2v2" /></>,
  expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5" />,
  palette: <><path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-3.7c-.8-.5-.4-2.3.8-2.3H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8Z" /><path d="M7 11h.01M9 7h.01M14 7h.01M17 10h.01" strokeWidth="3" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  pause: <><path d="M8 5v14M16 5v14" strokeWidth="3" /></>,
  home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10Z" /><path d="M9 21v-8h6v8" /></>,
  restart: <><path d="M3 10a9 9 0 1 1 1 8M3 4v6h6" /></>,
  moon: <path d="M20.8 13a9 9 0 0 1-9.8-9.8A9 9 0 1 0 20.8 13Z" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10h.01" /></>,
  keyboard: <><rect x="2" y="5" width="20" height="14" rx="3" /><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 16h10" /></>,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 1v3m0 16v3M1 12h3m16 0h3" /></>,
  leaf: <><path d="M20 3c-8-1-15 2-15 9 0 8 14 9 15-9ZM5 20l10-11" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-15a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 4v2" /></>,
  download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></>,
};

export function Icon({ name, size = 20, className = '', style }: { name: IconName; size?: number; className?: string; style?: CSSProperties }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>{paths[name]}</svg>;
}