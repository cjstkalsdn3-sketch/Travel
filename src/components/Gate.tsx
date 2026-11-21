'use client';

import { useState } from 'react';
import { createCouple, joinCouple, signIn, signOut, signUp, useSession } from '@/lib/store';

/** 로그인과 두 사람 공간 연결이 끝나야 앱을 보여준다. */
export function Gate({ children }: { children: React.ReactNode }) {
  const s = useSession();
  if (s.status === 'loading') return <main className="shell" aria-busy="true" />;
  if (s.status === 'signedOut') return <Login />;
  if (s.status === 'noCouple') return <Setup email={s.email} />;
  return <>{children}</>;
}

function Brand({ sub }: { sub: string }) {
  return (
    <header className="auth-brand">
      <div className="route auth-route" aria-hidden="true">
        <div><b>ME</b></div>
        <div className="route-line" />
        <div className="r"><b>YOU</b></div>
      </div>
      <h1 className="h1">우리 여행</h1>
      <p className="sub">{sub}</p>
    </header>
  );
}

function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (!email.includes('@')) return setErr('이메일을 확인해주세요.');
    if (pw.length < 6) return setErr('비밀번호는 6자 이상이어야 해요.');
    setBusy(true);
    const r = mode === 'in' ? await signIn(email.trim(), pw) : await signUp(email.trim(), pw);
    setBusy(false);
    if (r === 'confirm') setSent(true);
    else if (r) setErr(r);
  }

  if (sent)
    return (
      <main className="shell auth">
        <Brand sub="메일함을 확인해주세요" />
        <div className="card">
          <p style={{ margin: 0 }}><b>{email}</b>로 가입 확인 메일을 보냈어요. 메일의 링크를 누르면 바로 시작돼요.</p>
        </div>
        <button className="ghost-btn" onClick={() => (setSent(false), setMode('in'))}>로그인 화면으로</button>
      </main>
    );

  return (
    <main className="shell auth">
      <Brand sub="둘이 같이 쓰는 여행 일정·예산" />
      <form className="card auth-form" onSubmit={submit}>
        <div className="seg full" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'in'} className={mode === 'in' ? 'on' : ''} onClick={() => setMode('in')}>로그인</button>
          <button type="button" role="tab" aria-selected={mode === 'up'} className={mode === 'up' ? 'on' : ''} onClick={() => setMode('up')}>처음이에요</button>
        </div>
        <div className="field">
          <label htmlFor="em">이메일</label>
          <input className="inp" id="em" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pw">비밀번호</label>
          <input className="inp" id="pw" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={pw} onChange={(e) => setPw(e.target.value)} placeholder={mode === 'up' ? '6자 이상' : ''} />
        </div>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="primary" disabled={busy}>{busy ? '잠시만요…' : mode === 'in' ? '로그인' : '가입하기'}</button>
      </form>
      <p className="demo">로그인은 한 번만 하면 이 폰에서 계속 유지돼요.</p>
    </main>
  );
}

function Setup({ email }: { email?: string }) {
  const [mode, setMode] = useState<'new' | 'join'>('new');
  const [me, setMe] = useState('');
  const [you, setYou] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    const r = mode === 'new' ? await createCouple(me.trim(), you.trim()) : await joinCouple(code);
    setBusy(false);
    if (r) setErr(r);
  }

  return (
    <main className="shell auth">
      <Brand sub="두 사람이 같은 여행을 보도록 연결해요" />
      <form className="card auth-form" onSubmit={submit}>
        <div className="seg full" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'new'} className={mode === 'new' ? 'on' : ''} onClick={() => setMode('new')}>내가 먼저 시작</button>
          <button type="button" role="tab" aria-selected={mode === 'join'} className={mode === 'join' ? 'on' : ''} onClick={() => setMode('join')}>초대 코드 받았어요</button>
        </div>
        {mode === 'new' ? (
          <>
            <div className="row2">
              <div className="field"><label htmlFor="n1">내 이름</label><input className="inp" id="n1" value={me} onChange={(e) => setMe(e.target.value)} placeholder="민우" autoComplete="off" /></div>
              <div className="field"><label htmlFor="n2">상대 이름</label><input className="inp" id="n2" value={you} onChange={(e) => setYou(e.target.value)} placeholder="여자친구" autoComplete="off" /></div>
            </div>
            <p className="note" style={{ margin: 0 }}>만들면 6자리 초대 코드가 나와요. 상대에게 보내주면 돼요.</p>
          </>
        ) : (
          <div className="field">
            <label htmlFor="cd">초대 코드</label>
            <input className="inp num invite-in" id="cd" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="A1B2C3" autoComplete="off" autoCapitalize="characters" />
          </div>
        )}
        {err && <p className="err" role="alert">{err}</p>}
        <button className="primary" disabled={busy || (mode === 'join' && code.trim().length < 6)}>{busy ? '잠시만요…' : mode === 'new' ? '우리 공간 만들기' : '들어가기'}</button>
      </form>
      <p className="demo">
        {email} 로 로그인됨 · <button onClick={() => void signOut()}>다른 계정으로</button>
      </p>
    </main>
  );
}
