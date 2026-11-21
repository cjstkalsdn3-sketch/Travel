'use client';

import { Icon } from './Icon';
import { WX_LABEL, wxKind } from '@/lib/weather';
import type { WxDay, WxNow } from '@/lib/types';

/** 일정 카드 오른쪽 위 작은 날씨 */
export function WxBadge({ w }: { w: WxNow }) {
  const k = wxKind(w.c);
  const rainy = !w.done && w.p != null && w.p >= 40 && k !== 'rain' && k !== 'snow' && k !== 'storm' && k !== 'drizzle';
  return (
    <span className={'wxb k-' + k + (w.done ? ' done' : '')} title={(w.done ? '그때 날씨 · ' : '예보 · ') + WX_LABEL[k]}>
      <Icon name={k} size={15} />
      <b className="num">{w.t}°</b>
      {rainy && <small className="num">{w.p}%</small>}
      <span className="sr">{WX_LABEL[k]}</span>
    </span>
  );
}

/** 날짜 머리의 하루 날씨 */
export function WxDayPill({ w, far }: { w?: WxDay; far?: boolean }) {
  if (!w) return far ? <span className="wxd none">예보는 16일 전부터</span> : null;
  const k = wxKind(w.c);
  return (
    <span className={'wxd k-' + k}>
      <span className="wxd-ic"><Icon name={k} size={20} /></span>
      <span className="wxd-t">
        <small>{w.done ? '그날 날씨' : '예보'} · {WX_LABEL[k]}{!w.done && w.p != null && w.p >= 20 ? ` · 비 ${w.p}%` : ''}</small>
        <b className="num">{w.hi}° <span>/ {w.lo}°</span></b>
      </span>
    </span>
  );
}
