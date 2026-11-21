const P: Record<string, React.ReactNode> = {
  flight: <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />,
  stay: <><path d="M3 19V7M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-7v6" /><circle cx="7" cy="11.5" r="1.8" /></>,
  food: <path d="M7 3v18M4.5 3v5a2.5 2.5 0 0 0 5 0V3M17 21V3c-2 0-3.5 2.5-3.5 6s1.5 4 3.5 4" />,
  move: <><rect x="5" y="3" width="14" height="14" rx="3" /><path d="M5 11h14M8.5 21l1.5-4M15.5 21 14 17" /></>,
  sight: <><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  shop: <path d="M5 8h14l-1.2 12.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8L5 8zM9 8V6.5a3 3 0 0 1 6 0V8" />,
  etc: <><circle cx="6" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18" cy="12" r="1.3" /></>,
  walk: <><circle cx="13" cy="4.5" r="1.8" /><path d="M10 21l2-6-2.5-2.5L11 8l3 3 3 1M11 8l-3 2-1 3M14 15l2 6" /></>,
  taxi: <><path d="M5 16V11l2-5h10l2 5v5M3 16h18v3H3zM5 11h14" /><circle cx="7.5" cy="13.5" r=".8" /><circle cx="16.5" cy="13.5" r=".8" /></>,
  back: <path d="M15 5l-7 7 7 7" />,
  chev: <path d="M9 5l7 7-7 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  spark: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />,
  clip: <><rect x="8" y="3" width="8" height="4" rx="1" /><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" /></>,
  grip: <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  more: <><circle cx="12" cy="5.5" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="12" cy="18.5" r="1.4" /></>,
  cal: <><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  heart: <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z" />,
  wallet: <><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" /><rect x="4" y="8" width="17" height="12" rx="2.5" /><circle cx="16.5" cy="14" r="1.3" /></>,
  list: <path d="M9 7h11M9 12h11M9 17h11M4 7l1 1 2-2M4 12l1 1 2-2M4 17l1 1 2-2" />,
  ticket: <><path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4V8z" /><path d="M10 6v12" strokeDasharray="2 2" /></>,
  map: <path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4zM9 4v13.5M15 6.5V20" />,
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.6v.1" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  plug: <path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0V8zM12 17v4" />,
  coin: <><circle cx="12" cy="12" r="9" /><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.4 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6.5V8M12 16v1.5" /></>,
  pass: <><rect x="4" y="3" width="16" height="18" rx="2.5" /><circle cx="12" cy="10" r="3" /><path d="M8.5 17h7" /></>,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  offline: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>,
  cloud: <path d="M7 18h10a4 4 0 0 0 .4-8A5.5 5.5 0 0 0 7 9.5 4.3 4.3 0 0 0 7 18z" />,
  rain: <path d="M7 15h10a4 4 0 0 0 .4-8A5.5 5.5 0 0 0 7 6.5 4.3 4.3 0 0 0 7 15zM8 18l-1 3M12 18l-1 3M16 18l-1 3" />,
  snow: <path d="M7 15h10a4 4 0 0 0 .4-8A5.5 5.5 0 0 0 7 6.5 4.3 4.3 0 0 0 7 15zM8 19h.01M12 20h.01M16 19h.01" />,
  partly: <><path d="M8 4.5V3M3.9 6.2 3 5.3M2.5 10.5H1M12.6 6.2l.9-.9" /><path d="M5.2 11.2A3.5 3.5 0 0 1 11.4 8" /><path d="M9 20h8.5a3.5 3.5 0 0 0 .3-7A4.8 4.8 0 0 0 9 12.2 3.9 3.9 0 0 0 9 20z" /></>,
  fog: <path d="M7 12h10a4 4 0 0 0 .4-8A5.5 5.5 0 0 0 7 3.5 4.3 4.3 0 0 0 7 12zM4 16h16M6 20h12" />,
  drizzle: <path d="M7 15h10a4 4 0 0 0 .4-8A5.5 5.5 0 0 0 7 6.5 4.3 4.3 0 0 0 7 15zM9 18.5v1M15 18.5v1M12 20v1" />,
  storm: <path d="M7 15h10a4 4 0 0 0 .4-8A5.5 5.5 0 0 0 7 6.5 4.3 4.3 0 0 0 7 15zM12.5 15l-2 3.5h3l-2 3.5" />,
  plane2: <path d="M2.5 13.5 21 8.5c.8-.2 1.3.8.6 1.3L8 19l-2.2-.8 4.6-5.2-5.6 1.4-2-1.3 .2-.6z" fill="currentColor" stroke="none" />,
};

export type IconName = keyof typeof P;

export function Icon({ name, className, size }: { name: string; className?: string; size?: number }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {P[name] ?? P.etc}
    </svg>
  );
}
