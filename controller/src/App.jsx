import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

const TENOR_KEY      = 'LIVDSRZULELA';
const TENOR_TRENDING = `https://api.tenor.com/v1/trending?key=${TENOR_KEY}&limit=24&media_filter=minimal`;
const TENOR_SEARCH   = (q) => `https://api.tenor.com/v1/search?q=${encodeURIComponent(q)}&key=${TENOR_KEY}&limit=24&media_filter=minimal`;

const SESSION_KEY = 'party-session';

const STICKER_PACKS = [
  { label: 'Party',    stickers: ['🎉','🥳','🎊','🎈','🍾','🥂','🎆','🎇','🪄','🎪','🎠','🎡'] },
  { label: 'Love',     stickers: ['❤️','🧡','💛','💚','💙','💜','🖤','💕','💖','💗','💝','🫶'] },
  { label: 'Hype',     stickers: ['🔥','💯','⚡','🌟','💥','🚀','🏆','👑','✨','💫','🎯','🫡'] },
  { label: 'Feelings', stickers: ['😂','🤣','😍','🤩','🥹','😎','🥳','😜','🤪','😏','🫠','😅'] },
  { label: 'Gestures', stickers: ['👏','🙌','💪','🤝','👍','🤞','🤙','✌️','🫶','👋','🤜','🤛'] },
];

const AVATAR_COLORS = ['#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#DDA0DD','#F0A500','#7EC8E3','#FF8FAB'];
function avatarColor(name = '') {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xFFFFFFFF;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

// ── Icons ────────────────────────────────────────────────────────────────────
const IconMessage = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26">
    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
  </svg>
);
const IconSticker = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
  </svg>
);
const IconSmile = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
    <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
  </svg>
);
const IconArrowUp = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17">
    <path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z"/>
  </svg>
);
const IconSwitch = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" width="17" height="17">
    <path d="M17 3l4 4-4 4"/>
    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
    <path d="M7 21l-4-4 4-4"/>
    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
  </svg>
);
const IconClose = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
  </svg>
);

// ── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen,         setScreen]         = useState('join');
  const [partyCode,      setPartyCode]      = useState(() => tryLoad()?.code || '');
  const [name,           setName]           = useState(() => tryLoad()?.name || '');
  const [joinError,      setJoinError]      = useState('');
  const [joining,        setJoining]        = useState(false);
  const [session,        setSession]        = useState(null);
  const [messages,       setMessages]       = useState([]);
  const [draft,          setDraft]          = useState('');
  const [tab,            setTab]            = useState('text');
  const [showCodeChange, setShowCodeChange] = useState(false);
  const [chatOpen,       setChatOpen]       = useState(false);
  const [chatClosing,    setChatClosing]    = useState(false);
  const socketRef      = useRef(null);
  const messagesEndRef = useRef(null);
  const guestNameRef   = useRef('');

  function tryLoad() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
  }

  useEffect(() => {
    const saved = tryLoad();
    if (saved) doJoin(saved.code, saved.name);
  }, []);

  useEffect(() => {
    if (chatOpen) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatOpen]);

  function openChat() {
    setChatClosing(false);
    setChatOpen(true);
  }

  function closeChat() {
    setChatClosing(true);
    setTimeout(() => { setChatOpen(false); setChatClosing(false); }, 300);
  }

  async function handleJoin(e) {
    e.preventDefault();
    const code      = partyCode.trim();
    const guestName = name.trim() || `Guest${Math.floor(Math.random() * 900 + 100)}`;
    if (code.length !== 4) { setJoinError('Enter the 4-digit code from the TV screen.'); return; }
    doJoin(code, guestName);
  }

  async function doJoin(code, guestName) {
    setJoining(true);
    setJoinError('');
    try {
      const res = await fetch(`${BACKEND}/party/${code}`);
      if (!res.ok) {
        localStorage.removeItem(SESSION_KEY);
        setJoinError('Party not found. Check the code on TV.');
        setJoining(false);
        return;
      }
    } catch {
      setJoinError('Cannot reach server. Is the backend running?');
      setJoining(false);
      return;
    }

    guestNameRef.current = guestName;
    const socket = io(BACKEND);
    socketRef.current = socket;

    socket.on('connect', () => socket.emit('guest:join', { code, name: guestName }));

    socket.on('guest:joined', (state) => {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ code, name: guestName }));
      setSession({ code, name: guestName, memberCount: state.memberCount });
      setScreen('party');
      setJoining(false);
      addSystemMsg('You joined the party 🎉');
    });

    socket.on('party:member-joined', ({ name: who, memberCount: mc }) => {
      setSession(s => s ? { ...s, memberCount: mc } : s);
      if (who !== guestNameRef.current) addSystemMsg(`${who} joined`);
    });

    socket.on('party:member-left', ({ name: who, memberCount: mc }) => {
      setSession(s => s ? { ...s, memberCount: mc } : s);
      addSystemMsg(`${who} left`);
    });

    socket.on('party:message', (msg) => {
      setMessages(prev => [...prev, { ...msg, fromMe: msg.sender === guestNameRef.current }]);
    });

    socket.on('error', (err) => { setJoinError(err); setJoining(false); socket.disconnect(); });
  }

  function addSystemMsg(text) {
    setMessages(prev => [...prev, { id: `sys-${Date.now()}`, type: 'system', content: text, timestamp: Date.now() }]);
  }

  function sendMessage(content, type = 'text') {
    if (!content?.trim() || !session) return;
    socketRef.current?.emit('guest:message', { code: session.code, content, type });
    if (type === 'text') setDraft('');
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(draft); }
  }

  async function handleCodeChange(newCode) {
    setShowCodeChange(false);
    socketRef.current?.disconnect();
    socketRef.current = null;
    setMessages([]);
    setDraft('');
    setTab('text');
    doJoin(newCode, session.name);
  }

  useEffect(() => () => socketRef.current?.disconnect(), []);

  // ── Join screen ─────────────────────────────────────────────────────────────
  if (screen === 'join') {
    return (
      <div className="ios-root">
        <div className="ios-join-wrap">
          <div className="ios-join-hero">
            <div className="ios-join-icon">🎉</div>
            <h1 className="ios-join-title">Party Screen</h1>
            <p className="ios-join-sub">Join a live party on the big screen</p>
          </div>

          <form onSubmit={handleJoin} className="ios-join-form">
            <div className="ios-group">
              <input
                className="ios-group-input"
                placeholder="Your Name"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={30}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <div className="ios-group-sep" />
              <input
                className="ios-group-input ios-code-input"
                placeholder="Party Code"
                value={partyCode}
                onChange={e => setPartyCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                inputMode="numeric"
                autoComplete="off"
              />
            </div>

            {joinError && <p className="ios-inline-error">{joinError}</p>}

            <button className="ios-primary-btn" type="submit" disabled={joining}>
              {joining ? 'Joining…' : 'Join Party'}
            </button>
          </form>

          <p className="ios-footer-note">Open the TV screen to get your code</p>
        </div>
      </div>
    );
  }

  // ── Party screen (default after join) ────────────────────────────────────────
  const userMessages = messages.filter(m => m.type !== 'system');
  const latestMsg    = userMessages[userMessages.length - 1] || null;

  return (
    <div className="ios-root" style={{ height: '100dvh', overflow: 'hidden' }}>

      {/* ── Party Screen View ── */}
      <div className="party-view">
        {/* Top-right: code + members */}
        <div className="party-view-top">
          <div className="party-view-code">{session.code}</div>
          <div className="party-view-members">
            {session.memberCount > 1 ? `${session.memberCount} people` : 'Just you'}
          </div>
        </div>

        {/* Center: latest message card */}
        <div className="party-view-center">
          {latestMsg ? (
            <div className="party-glass-wrap" key={latestMsg.id}>
              <div className="party-glass-card">
                {latestMsg.type === 'gif'
                  ? <img className="party-glass-gif" src={latestMsg.content} alt="GIF" />
                  : latestMsg.type === 'sticker'
                  ? <div className="party-glass-emoji">{latestMsg.content}</div>
                  : <div className="party-glass-text">{latestMsg.content}</div>
                }
              </div>
              <div className="party-glass-name">{latestMsg.sender}</div>
            </div>
          ) : (
            <div className="party-empty-state">
              <div className="party-empty-emoji">📺</div>
              <div className="party-empty-text">Party Screen</div>
              <div className="party-empty-sub">Tap the button below to send a message</div>
            </div>
          )}
        </div>

        {/* Chat FAB */}
        <button className="party-chat-fab" onClick={openChat} aria-label="Open chat">
          <IconMessage />
          {userMessages.length > 0 && (
            <span className="party-fab-badge">{userMessages.length > 99 ? '99+' : userMessages.length}</span>
          )}
        </button>
      </div>

      {/* ── Code change sheet (above party view) ── */}
      {showCodeChange && (
        <CodeChangeSheet
          onSwitch={handleCodeChange}
          onClose={() => setShowCodeChange(false)}
        />
      )}

      {/* ── Chat Sheet overlay ── */}
      {chatOpen && (
        <div className={`chat-sheet ${chatClosing ? 'chat-sheet-closing' : ''}`}>
          <div className="chat-sheet-inner">

            {/* Navbar */}
            <nav className="ios-navbar">
              <button className="ios-navbar-left ios-switch-btn" onClick={() => setShowCodeChange(true)}>
                <IconSwitch />
              </button>
              <div className="ios-navbar-center">
                <div className="ios-navbar-title">Party {session.code}</div>
                <div className="ios-navbar-sub">
                  {session.memberCount > 0 ? `${session.memberCount} people` : 'Just you'}
                </div>
              </div>
              <button className="ios-navbar-right chat-close-btn" onClick={closeChat} aria-label="Close chat">
                <IconClose />
              </button>
            </nav>

            {/* Messages */}
            <div className="ios-messages">
              {messages.length === 0 && (
                <div className="ios-empty-chat">
                  <div className="ios-empty-icon">📺</div>
                  <div className="ios-empty-text">Say something</div>
                  <div className="ios-empty-sub">Your messages will appear on the TV</div>
                </div>
              )}
              {messages.map((m, i) =>
                m.type === 'system'
                  ? <div key={m.id || i} className="ios-system-msg">{m.content}</div>
                  : <ChatMessage key={m.id || i} msg={m} />
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Bottom dock */}
            <div className="ios-dock">
              {tab === 'text' && (
                <div className="ios-text-panel">
                  <div className="ios-quick-row">
                    {['🎉','🔥','😂','❤️','👏','🙌','🥳','😍','💯','👀'].map(e => (
                      <button key={e} className="ios-quick-btn" onClick={() => sendMessage(e)}>{e}</button>
                    ))}
                  </div>
                  <div className="ios-input-row">
                    <textarea
                      className="ios-input"
                      placeholder="iMessage"
                      value={draft}
                      onChange={e => setDraft(e.target.value)}
                      onKeyDown={handleKeyDown}
                      rows={1}
                      maxLength={200}
                    />
                    <button className="ios-send-btn" onClick={() => sendMessage(draft)} disabled={!draft.trim()}>
                      <IconArrowUp />
                    </button>
                  </div>
                </div>
              )}
              {tab === 'gif'     && <GifPanel     onSend={(url)   => { sendMessage(url, 'gif');     setTab('text'); }} />}
              {tab === 'sticker' && <StickerPanel onSend={(emoji) => { sendMessage(emoji, 'sticker'); setTab('text'); }} />}

              {/* Tab bar */}
              <div className="ios-tabbar">
                {[
                  { id: 'text',    icon: <IconMessage />, label: 'Message' },
                  { id: 'gif',     icon: <span className="gif-badge-icon">GIF</span>, label: 'GIF' },
                  { id: 'sticker', icon: <IconSmile />,   label: 'Sticker' },
                ].map(t => (
                  <button
                    key={t.id}
                    className={`ios-tab ${tab === t.id ? 'active' : ''}`}
                    onClick={() => setTab(t.id)}
                  >
                    <span className="ios-tab-icon">{t.icon}</span>
                    <span className="ios-tab-label">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

// ── Code Change Sheet ─────────────────────────────────────────────────────────
function CodeChangeSheet({ onSwitch, onClose }) {
  const [code, setCode]   = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (code.length !== 4) { setError('Enter the 4-digit code from the TV.'); return; }
    onSwitch(code);
  }

  return (
    <div className="ios-sheet-backdrop" onClick={onClose}>
      <div className="ios-sheet" onClick={e => e.stopPropagation()}>
        <div className="ios-sheet-handle" />
        <div className="ios-sheet-title">Switch Party</div>
        <div className="ios-sheet-sub">Enter the code shown on a different TV screen</div>
        <form onSubmit={handleSubmit}>
          <input
            className="ios-sheet-code-input"
            placeholder="Party Code"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
            inputMode="numeric"
            autoFocus
            autoComplete="off"
          />
          {error && <p className="ios-inline-error ios-sheet-error">{error}</p>}
          <div className="ios-sheet-actions">
            <button type="button" className="ios-sheet-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="ios-sheet-confirm">Switch</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── GIF Panel ────────────────────────────────────────────────────────────────
function GifPanel({ onSend }) {
  const [query, setQuery]     = useState('');
  const [gifs, setGifs]       = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef           = useRef(null);

  useEffect(() => { loadGifs(''); }, []);

  async function loadGifs(q) {
    setLoading(true);
    try {
      const res  = await fetch(q.trim() ? TENOR_SEARCH(q) : TENOR_TRENDING);
      const data = await res.json();
      setGifs(data.results || []);
    } catch { setGifs([]); }
    setLoading(false);
  }

  function handleSearch(e) {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadGifs(q), 400);
  }

  return (
    <div className="ios-panel ios-gif-panel">
      <div className="ios-panel-search">
        <div className="ios-search-wrap">
          <span className="ios-search-icon">🔍</span>
          <input className="ios-search-input" placeholder="Search GIFs" value={query} onChange={handleSearch} />
        </div>
      </div>
      {loading
        ? <div className="ios-panel-loader"><div className="ios-spinner" /></div>
        : (
          <div className="ios-gif-grid">
            {gifs.map(g => {
              const media      = g.media?.[0];
              const previewUrl = media?.nanogif?.url || media?.tinygif?.url;
              const sendUrl    = media?.gif?.url     || media?.tinygif?.url;
              if (!previewUrl) return null;
              return (
                <button key={g.id} className="ios-gif-item" onClick={() => onSend(sendUrl)}>
                  <img src={previewUrl} alt={g.title} loading="lazy" />
                </button>
              );
            })}
            {!loading && gifs.length === 0 && <div className="ios-panel-empty">No GIFs found</div>}
          </div>
        )
      }
    </div>
  );
}

// ── Sticker Panel ─────────────────────────────────────────────────────────────
function StickerPanel({ onSend }) {
  const [pack, setPack] = useState(0);
  return (
    <div className="ios-panel ios-sticker-panel">
      <div className="ios-pack-tabs">
        {STICKER_PACKS.map((p, i) => (
          <button
            key={p.label}
            className={`ios-pack-tab ${i === pack ? 'active' : ''}`}
            onClick={() => setPack(i)}
          >
            {p.stickers[0]}
          </button>
        ))}
      </div>
      <div className="ios-sticker-grid">
        {STICKER_PACKS[pack].stickers.map(s => (
          <button key={s} className="ios-sticker-btn" onClick={() => onSend(s)}>{s}</button>
        ))}
      </div>
    </div>
  );
}

// ── Chat Message ──────────────────────────────────────────────────────────────
function ChatMessage({ msg }) {
  const isMe    = msg.fromMe;
  const time    = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const initial = msg.sender?.charAt(0)?.toUpperCase() || '?';
  const color   = avatarColor(msg.sender);

  return (
    <div className={`ios-msg-row ${isMe ? 'me' : 'them'}`}>
      {!isMe && (
        <div className="ios-avatar" style={{ background: color }}>{initial}</div>
      )}
      <div className="ios-msg-body">
        {!isMe && <div className="ios-msg-name">{msg.sender}</div>}
        {msg.type === 'gif'
          ? <img className="ios-msg-gif" src={msg.content} alt="GIF" />
          : msg.type === 'sticker'
          ? <div className="ios-msg-sticker">{msg.content}</div>
          : <div className={`ios-bubble ${isMe ? 'ios-bubble-me' : 'ios-bubble-them'}`}>{msg.content}</div>
        }
        <div className="ios-msg-time">{time}</div>
      </div>
    </div>
  );
}
