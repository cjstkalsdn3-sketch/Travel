'use client';

import { useState } from 'react';
import { Icon } from './Icon';
import { SheetHead, useUI } from './ui';
import { allAlts, deleteAlt, newAlt, renameAlt, switchAlt } from '@/lib/plan';
import { updateTrip, useTrip } from '@/lib/store';
import type { Trip } from '@/lib/types';

/** 일정 탭 위: A안·B안 바로 바꾸기 */
export function AltBar({ trip }: { trip: Trip }) {
  const { open, toast } = useUI();
  const alts = allAlts(trip);
  function go(id: string, name: string) {
    let prev = '';
    updateTrip(trip.id, (t) => {
      switchAlt(t, id);
      prev = t.alts?.at(-1)?.id ?? '';
    });
    toast(`${name}으로 바꿨어요`, { label: '되돌리기', run: () => prev && updateTrip(trip.id, (t) => switchAlt(t, prev)) });
  }
  return (
    <div className="altbar" role="tablist" aria-label="일정 안">
      {alts.map((a) => (
        <button key={a.id} role="tab" aria-selected={a.on} className={'alt' + (a.on ? ' on' : '')} onClick={() => (a.on ? open(<AltSheet trip={trip} />) : go(a.id, a.name))}>
          {a.name}
          <small>{a.count}</small>
        </button>
      ))}
      <button className="alt add" onClick={() => open(<AltSheet trip={trip} />)} aria-label="일정 안 만들기·관리">
        <Icon name="plus" />
        {alts.length === 1 && '다른 안'}
      </button>
    </div>
  );
}

export function AltSheet({ trip: first }: { trip: Trip }) {
  const { close, toast } = useUI();
  // 시트는 열 때의 값을 받으니, 고친 내용이 바로 보이게 최신 여행을 다시 읽음
  const trip = useTrip(first.id) ?? first;
  const alts = allAlts(trip);
  const [edit, setEdit] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [arm, setArm] = useState<string | null>(null);

  function make(copy: boolean) {
    let n = '';
    updateTrip(trip.id, (t) => void (n = newAlt(t, copy)));
    close();
    toast(copy ? `${n}을 만들었어요. 마음껏 바꿔보세요` : `${n}을 만들었어요. 항공·숙소만 넣어뒀어요`);
  }
  function save(id: string) {
    updateTrip(trip.id, (t) => renameAlt(t, id, name));
    setEdit(null);
  }

  return (
    <>
      <SheetHead title="일정 안" />
      <p className="sub" style={{ margin: 0 }}>한 여행에 일정을 여러 안으로 만들어두고 비교해보세요. 담아둔 장소·예약·지출은 모든 안이 같이 써요.</p>
      <ul className="alt-list">
        {alts.map((a) => (
          <li key={a.id} className={a.on ? 'on' : ''}>
            {edit === a.id ? (
              <form
                className="alt-edit"
                onSubmit={(e) => {
                  e.preventDefault();
                  save(a.id);
                }}
              >
                <input className="inp" autoFocus value={name} maxLength={20} onChange={(e) => setName(e.target.value)} aria-label="안 이름" />
                <button className="pill-btn">저장</button>
              </form>
            ) : (
              <>
                <span className="alt-t">
                  <b>{a.name}</b>
                  <small>{a.on ? '지금 보는 안 · ' : ''}일정 {a.count}개</small>
                </span>
                <button className="edit-s" onClick={() => { setEdit(a.id); setName(a.name); }}>이름</button>
                {!a.on &&
                  (arm === a.id ? (
                    <button className="edit-s del" onClick={() => { updateTrip(trip.id, (t) => deleteAlt(t, a.id)); setArm(null); }}>정말 지우기</button>
                  ) : (
                    <button className="edit-s" onClick={() => setArm(a.id)}>지우기</button>
                  ))}
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="alt-new">
        <button className="sec-btn" onClick={() => make(true)}>
          <Icon name="clip" />지금 일정 복사
        </button>
        <button className="sec-btn" onClick={() => make(false)}>
          <Icon name="plus" />항공·숙소만 두고 새로
        </button>
      </div>
    </>
  );
}
