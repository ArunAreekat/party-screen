import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
const LOOP_SIZE = 10;
const TICKER_MAX = 22;
let _key = 0;

function getMsgDuration(msg) {
  if (msg.type === 'gif') return 5000;
  if (msg.type === 'sticker') return 3000;
  return msg.content.length > 60 ? 5000 : 3500;
}

function tickerContent(msg) {
  if (msg.type === 'sticker') return msg.content;
  if (msg.type === 'gif') return 'GIF 🎬';
  const t = msg.content;
  return t.length > TICKER_MAX ? t.slice(0, TICKER_MAX) + '…' : t;
}

/* ── Icons ─────────────────────────────────────────────────────────────────── */
function GearIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65
        1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9
        19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0
        4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65
        0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65
        0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l
        .06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51
        1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M2.5 7.5l3.5 3.5 6.5-7" stroke="#0A84FF"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function FlashIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      <rect x="5" y="3" width="20" height="24" rx="5"
        fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5"/>
    </svg>
  );
}

function SequenceIcon() {
  return (
    <svg width="38" height="30" viewBox="0 0 38 30" fill="none">
      <rect x="0"  y="6" width="14" height="18" rx="3.5"
        fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.18)" strokeWidth="1.2"/>
      <rect x="24" y="6" width="14" height="18" rx="3.5"
        fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.18)" strokeWidth="1.2"/>
      <rect x="10" y="2" width="18" height="26" rx="5"
        fill="rgba(255,255,255,0.14)" stroke="rgba(255,255,255,0.45)" strokeWidth="1.6"/>
    </svg>
  );
}

/* ── Main App ───────────────────────────────────────────────────────────────── */
export default function App() {
  const [partyCode,    setPartyCode]    = useState(null);
  const [activeMsg,    setActiveMsg]    = useState(null);
  const [seqMessages,  setSeqMessages]  = useState([]);
  const [tickerMsgs,   setTickerMsgs]   = useState([]);
  const [status,       setStatus]       = useState('creating');
  const [preset,       setPreset]       = useState('flash');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const socketRef      = useRef(null);
  const queueRef       = useRef([]);
  const displayTimerRef = useRef(null);

  useEffect(() => {
    fetch(`${BACKEND}/party/create`, { method: 'POST' })
      .then(r => r.json())
      .then(({ code }) => { setPartyCode(code); setStatus('ready'); connectSocket(code); })
      .catch(() => setStatus('error'));
  }, []);

  function connectSocket(code) {
    const socket = io(BACKEND);
    socketRef.current = socket;
    socket.on('connect', () => socket.emit('tv:join', { code }));
    // If backend restarted with a new party, reload to re-create
    socket.on('error', (err) => {
      if (err === 'Party not found') window.location.reload();
    });
    socket.on('party:message', (msg) => {
      const m = { ...msg, key: `k${++_key}` };
      setTickerMsgs(prev => [...prev.slice(-50), m]);
      setSeqMessages(prev => {
        const next = [...prev, m];
        return next.length > LOOP_SIZE ? next.slice(-LOOP_SIZE) : next;
      });
      queueRef.current.push(m);
      if (queueRef.current.length > LOOP_SIZE) queueRef.current.shift();
      if (!displayTimerRef.current) scheduleNext(0);
    });
  }

  function scheduleNext(delay) {
    displayTimerRef.current = setTimeout(() => {
      displayTimerRef.current = null;
      if (queueRef.current.length === 0) { setActiveMsg(null); return; }
      const msg = queueRef.current.shift();
      queueRef.current.push(msg);
      setActiveMsg({ ...msg, key: `a${Date.now()}` });
      scheduleNext(getMsgDuration(msg));
    }, delay);
  }

  useEffect(() => () => {
    clearTimeout(displayTimerRef.current);
    socketRef.current?.disconnect();
  }, []);

  if (status === 'creating') return <div className="tv-splash">Setting up party…</div>;
  if (status === 'error')    return <div className="tv-splash error">Could not reach backend.</div>;

  const codeFormatted = partyCode?.split('').join('.');

  return (
    <div className="tv-root" onClick={() => settingsOpen && setSettingsOpen(false)}>
      <div className="tv-brand">Party Screen</div>

      <div className="tv-top-right">
        <span className="tv-code">{codeFormatted}</span>
        <button
          className={`tv-settings-btn ${settingsOpen ? 'tv-settings-btn--active' : ''}`}
          onClick={e => { e.stopPropagation(); setSettingsOpen(o => !o); }}
        >
          <GearIcon />
        </button>
      </div>

      {settingsOpen && (
        <div className="settings-panel" onClick={e => e.stopPropagation()}>
          <div className="settings-header">Display Mode</div>
          <button
            className={`settings-row ${preset === 'flash' ? 'settings-row--on' : ''}`}
            onClick={() => { setPreset('flash'); setSettingsOpen(false); }}
          >
            <div className="settings-row-icon"><FlashIcon /></div>
            <div className="settings-row-body">
              <div className="settings-row-name">Flash</div>
              <div className="settings-row-desc">Full-screen, one at a time</div>
            </div>
            {preset === 'flash' && <CheckIcon />}
          </button>
          <div className="settings-sep" />
          <button
            className={`settings-row ${preset === 'sequence' ? 'settings-row--on' : ''}`}
            onClick={() => { setPreset('sequence'); setSettingsOpen(false); }}
          >
            <div className="settings-row-icon"><SequenceIcon /></div>
            <div className="settings-row-body">
              <div className="settings-row-name">Sequence</div>
              <div className="settings-row-desc">Sliding carousel loop</div>
            </div>
            {preset === 'sequence' && <CheckIcon />}
          </button>
        </div>
      )}

      <main className={`tv-stage ${preset === 'sequence' ? 'tv-stage--seq' : ''}`}>
        {preset === 'flash'
          ? <GlassCard msg={activeMsg} />
          : <SequenceView messages={seqMessages} />
        }
      </main>

      {tickerMsgs.length > 0 && <Ticker messages={tickerMsgs} />}
    </div>
  );
}

/* ── Flash card ─────────────────────────────────────────────────────────────── */
function GlassCard({ msg }) {
  if (!msg) return <div className="glass-card glass-card--idle" />;
  return (
    <div className="glass-wrap" key={msg.key}>
      <div className={`glass-card ${msg.type === 'gif' ? 'glass-card--gif' : ''}`}>
        <CardContent msg={msg} />
      </div>
      <div className="glass-name">{msg.sender}</div>
    </div>
  );
}

function CardContent({ msg }) {
  if (msg.type === 'sticker') return <div className="glass-emoji">{msg.content}</div>;
  if (msg.type === 'gif')     return <img className="glass-gif" src={msg.content} alt="" />;
  return <div className="glass-text">{msg.content}</div>;
}

/* ── Sequence carousel ──────────────────────────────────────────────────────── */
function SequenceView({ messages }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const n = messages.length;

  useEffect(() => {
    if (n < 2) return;
    const t = setInterval(() => setActiveIdx(i => (i + 1) % n), 3000);
    return () => clearInterval(t);
  }, [n]);

  if (n === 0) return <div className="glass-card glass-card--idle" />;

  const safe = n > 0 ? activeIdx % n : 0;

  return (
    <div className="seq-stage">
      {messages.map((msg, i) => {
        let off = i - safe;
        if (off >  n / 2) off -= n;
        if (off < -n / 2) off += n;
        const abs = Math.abs(off);
        if (abs > 2) return null;
        return (
          <div
            key={msg.key}
            className="seq-item"
            style={{ '--off': off, '--abs': abs }}
          >
            <div className={`glass-card ${msg.type === 'gif' ? 'seq-gif-card' : ''}`}>
              <CardContent msg={msg} />
            </div>
            {abs === 0 && <div className="glass-name">{msg.sender}</div>}
          </div>
        );
      })}
    </div>
  );
}

/* ── Ticker ─────────────────────────────────────────────────────────────────── */
function Ticker({ messages }) {
  const items = [...messages, ...messages];
  return (
    <div className="ticker">
      <div className="ticker-track">
        {items.map((m, i) => (
          <span key={i} className="ticker-item">
            <span className="ticker-name">{m.sender}</span>
            <span className="ticker-sep">·</span>
            <span className="ticker-msg">{tickerContent(m)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
