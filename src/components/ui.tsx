'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { CATS } from '@/lib/constants';
import type { Cat } from '@/lib/types';
import { setPersistErrorHandler } from '@/lib/store';

/* ---------- Sheet + Toast provider ---------- */
interface UI {
  open: (node: React.ReactNode) => void;
  close: () => void;
  toast: (msg: string) => void;
}
const Ctx = createContext<UI | null>(null);
export const useUI = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('UIProvider missing');
  return c;
};

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [sheet, setSheet] = useState<React.ReactNode>(null);
  const [msg, setMsg] = useState<{ text: string; key: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const toast = useCallback((text: string) => {
    setMsg({ text, key: Date.now() });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 1800);
  }, []);
  const open = useCallback((node: React.ReactNode) => setSheet(node), []);
  const close = useCallback(() => setSheet(null), []);

  useEffect(() => setPersistErrorHandler(toast), [toast]);
  useEffect(() => {
    if (!sheet) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSheet(null);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [sheet]);

  return (
    <Ctx.Provider value={{ open, close, toast }}>
      {children}
      {sheet && (
        <div className="scrim" onClick={(e) => e.target === e.currentTarget && close()}>
          <div className="sheet" role="dialog" aria-modal="true">
            <div className="grab" />
            {sheet}
          </div>
        </div>
      )}
      {msg && (
        <div className="toast" key={msg.key} role="status">
          {msg.text}
        </div>
      )}
    </Ctx.Provider>
  );
}

/* ---------- small building blocks ---------- */
export function SheetHead({ title }: { title: string }) {
  const { close } = useUI();
  return (
    <div className="sh-head">
      <h3>{title}</h3>
      <button className="icon-btn" onClick={close} aria-label="닫기">
        <Icon name="x" />
      </button>
    </div>
  );
}

export function Seg<T extends string>({
  value,
  onChange,
  options,
  full,
  id,
}: {
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
  full?: boolean;
  id?: string;
}) {
  return (
    <div className={'seg' + (full ? ' full' : '')} role="radiogroup" id={id}>
      {options.map(([k, l]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function CatChips({
  value,
  onChange,
  keys,
  label = (k) => CATS[k],
}: {
  value: Cat;
  onChange: (c: Cat) => void;
  keys: Cat[];
  label?: (k: Cat) => string;
}) {
  return (
    <div className="chips" role="radiogroup">
      {keys.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          className={'chip' + (value === c ? ' on' : '')}
          style={{ '--cc': `var(--c-${c})` } as React.CSSProperties}
          onClick={() => onChange(c)}
        >
          <Icon name={c} />
          {label(c)}
        </button>
      ))}
    </div>
  );
}

/** 한 번 누르면 확인 문구로 바뀌고, 한 번 더 누르면 실행되는 버튼 (삭제 등). */
export function ConfirmButton({ label, confirm = '한 번 더 누르면 삭제돼요', onConfirm }: { label: string; confirm?: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  return (
    <button type="button" className={'danger' + (armed ? ' armed' : '')} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? confirm : label}
    </button>
  );
}

export function useCopy() {
  const { toast } = useUI();
  return (v: string) => {
    try {
      navigator.clipboard.writeText(v).then(
        () => toast(`${v} 복사했어요`),
        () => toast('길게 눌러서 복사하세요'),
      );
    } catch {
      toast('길게 눌러서 복사하세요');
    }
  };
}

export const ccStyle = (c: string) => ({ '--cc': `var(--c-${c})` }) as React.CSSProperties;
