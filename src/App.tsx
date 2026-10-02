import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AgarEngine } from './agar/engine';
import { Icon, type IconName } from './agar/Icon';
import { drawCell, renderArena, renderMinimap } from './agar/renderer';
import { arenaSound } from './agar/sound';
import { CELL_COLORS, TEAM_COLORS, type ArenaSnapshot, type GameMode, type Preferences, type SkinId } from './agar/types';
import { BALANCE } from './agar/config';
import {
  ACHIEVEMENTS, SAVE_VERSION, earnedAchievements, loadSave, persistSave, sanitizeNickname, calculateLevel, type BestStats,
} from './agar/storage';

type Popup = 'settings' | 'help' | 'skins' | 'about' | 'pause' | 'codex' | null;
const SKINS: { id: SkinId; name: string; color: string; legendary?: boolean }[] = [
  { id: 'classic', name: 'Nguyên bản', color: '#ee7b58' },
  { id: 'earth', name: 'Trái đất', color: '#619fdb' },
  { id: 'smile', name: 'Vui vẻ', color: '#f3c866' },
  { id: 'melon', name: 'Dưa hấu', color: '#79b86e' },
  { id: 'planet', name: 'Sao Thổ', color: '#8476bb' },
  { id: '8ball', name: 'Bi số 8', color: '#42464e' },
  { id: 'sunset', name: 'Hoàng hôn', color: '#d492c6' },
  { id: 'checker', name: 'Ô bàn cờ', color: '#a69ccc' },
  { id: 'galaxy', name: 'Dải Ngân Hà', color: '#6b4fa8' },
  { id: 'fire', name: 'Hỏa Diệm Sơn', color: '#e74c3c' },
  { id: 'neon', name: 'Neon Xanh', color: '#00cec9' },
  { id: 'gold', name: 'Vàng Hoàng Kim', color: '#f1c40f' },
  { id: 'venom', name: 'Hắc Ám Venom', color: '#2d3436' },
  { id: 'dragon', name: 'Long Thần', color: '#0f3460', legendary: true },
  { id: 'phoenix', name: 'Phượng Hoàng Lửa', color: '#800f2f', legendary: true },
  { id: 'portal', name: 'Hố Đen Vũ Trụ', color: '#03071e', legendary: true },
  { id: 'cyber', name: 'Lưới Điện Cyber', color: '#1a102f', legendary: true },
  { id: 'sakura', name: 'Hoa Anh Đào', color: '#ffe5ec', legendary: true },
];
const NICKNAME_PRESETS = ['Tiêu Phong', 'Hải Tặc', 'Vua Banh', 'Cá Mập', 'Siêu Nhân', 'Bánh Bao', 'Kẻ Hủy Diệt', 'Cosmic Blob', 'TitanX', 'Shadow', 'Quantum', 'Apex', 'Nova', 'Vô Danh', 'Thần Tốc'];
const randomNickname = () => NICKNAME_PRESETS[Math.floor(Math.random() * NICKNAME_PRESETS.length)];
const MODE_LABELS: Record<GameMode, string> = {
  ffa: 'Tự do (FFA)',
  teams: 'Đồng đội',
  experimental: 'Thử nghiệm',
  royale: 'Sinh tồn Vòng Bo',
  turbo: 'Siêu Tốc Độ',
  boss: 'Săn Boss Titan',
};

function number(value: number) { return Math.round(value).toLocaleString('vi-VN'); }
function duration(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}

export default function App() {
  const [engine] = useState(() => new AgarEngine());
  const [initialSave] = useState(loadSave);
  const [snapshot, setSnapshot] = useState<ArenaSnapshot>(() => engine.snapshot());
  const [preferences, setPreferences] = useState<Preferences>(initialSave.preferences);
  const preferencesRef = useRef(preferences);
  const [nickname, setNickname] = useState(initialSave.nickname);
  const [mode, setMode] = useState<GameMode>(initialSave.mode);
  const [skin, setSkin] = useState<SkinId>(initialSave.skin);
  const [color, setColor] = useState(initialSave.color);
  const [record, setRecord] = useState(initialSave.record);
  const [volume, setVolume] = useState(initialSave.volume);
  const [achievements, setAchievements] = useState<string[]>(initialSave.achievements);
  const achievementsRef = useRef(achievements);
  const [best, setBest] = useState<BestStats>(initialSave.best);
  const [exp, setExp] = useState(initialSave.exp || 0);
  const [level, setLevel] = useState(initialSave.level || 1);
  const [lastEarnedExp, setLastEarnedExp] = useState(0);
  const levelInfo = calculateLevel(exp);
  const countedRun = useRef('');
  const [debug] = useState(() => {
    try { return new URLSearchParams(window.location.search).has('debug'); } catch { return false; }
  });
  const [aiLine, setAiLine] = useState('');
  const [diagnostics, setDiagnostics] = useState(() => engine.diagnostics());
  const [fps, setFps] = useState(0);
  const [popup, setPopup] = useState<Popup>(null);
  const popupRef = useRef<Popup>(popup);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [touch, setTouch] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const lobby = snapshot.phase === 'lobby';
  const playing = snapshot.phase === 'playing';
  const spectating = snapshot.phase === 'spectating';
  const currentSkin = SKINS.find(item => item.id === skin)!;

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3000);
  }, []);

  const openPopup = useCallback((next: Popup) => {
    if (next) arenaSound.play('click');
    popupRef.current = next;
    setPopup(next);
    engine.keys.clear();
    engine.paused = next !== null && (engine.phase === 'playing' || engine.phase === 'spectating');
    engine.pointer = { x: 0, y: 0 };
    touchOrigin.current = null;
    setTouch(null);
    setSnapshot(engine.snapshot());
  }, [engine]);

  const play = useCallback((event?: FormEvent) => {
    event?.preventDefault();
    arenaSound.enabled = preferencesRef.current.sound;
    arenaSound.unlock();
    engine.start(nickname, mode, skin, skin === 'classic' ? color : currentSkin.color);
    openPopup(null);
    setToast('');
    setSnapshot(engine.snapshot());
    (document.activeElement as HTMLElement)?.blur();
    canvasRef.current?.focus({ preventScroll: true });
  }, [engine, nickname, mode, skin, color, currentSkin.color, openPopup]);

  const returnToLobby = useCallback(() => {
    engine.lobby();
    openPopup(null);
    setSnapshot(engine.snapshot());
  }, [engine, openPopup]);

  const split = useCallback(() => {
    if (!engine.split() && engine.phase === 'playing' && !engine.paused) {
      notify(engine.player.cells.length >= BALANCE.maxFragments
        ? `Bạn đã có tối đa ${BALANCE.maxFragments} tế bào.`
        : `Cần ít nhất ${BALANCE.minSplitMass} khối lượng để tách tế bào.`);
    }
    setSnapshot(engine.snapshot());
  }, [engine, notify]);

  const togglePreference = useCallback((key: keyof Preferences) => {
    const next = { ...preferencesRef.current, [key]: !preferencesRef.current[key] };
    preferencesRef.current = next;
    setPreferences(next);
    if (key === 'sound') {
      arenaSound.enabled = next.sound;
      if (next.sound) { arenaSound.unlock(); arenaSound.play('eat'); }
    }
  }, []);

  useEffect(() => {
    preferencesRef.current = preferences;
    achievementsRef.current = achievements;
    arenaSound.enabled = preferences.sound;
    arenaSound.setVolume(volume);
    persistSave({
      version: SAVE_VERSION, nickname: sanitizeNickname(nickname), mode, skin, color,
      record, volume, preferences, achievements, best, exp, level,
    });
  }, [preferences, nickname, mode, skin, color, record, volume, achievements, best, exp, level]);

  useEffect(() => {
    if (snapshot.phase !== 'playing' && snapshot.phase !== 'ended') return;
    const stats = snapshot.stats;
    if (stats.peak > record) setRecord(stats.peak);
    const fresh = earnedAchievements(stats, achievementsRef.current);
    if (fresh.length) {
      const next = [...achievementsRef.current, ...fresh];
      achievementsRef.current = next;
      setAchievements(next);
      const meta = ACHIEVEMENTS.find(entry => entry.id === fresh[0]);
      if (meta) {
        notify(`Thành tựu: ${meta.name} — ${meta.hint}`);
        arenaSound.play('achievement');
      }
    }
    if (snapshot.phase === 'ended') {
      const key = `${Math.round(stats.seconds)}-${stats.peak}-${stats.food}-${stats.cells}`;
      if (countedRun.current !== key) {
        countedRun.current = key;
        const earnedExp = Math.round(stats.peak * 0.2 + stats.food * 0.5 + stats.cells * 15 + stats.seconds);
        setLastEarnedExp(earnedExp);
        setExp(prevExp => {
          const nextExp = prevExp + earnedExp;
          const info = calculateLevel(nextExp);
          setLevel(info.level);
          return nextExp;
        });
        setBest(prev => ({
          bestMass: Math.max(prev.bestMass, stats.peak),
          bestRank: prev.bestRank > 0 && stats.bestRank > 0 ? Math.min(prev.bestRank, stats.bestRank) : Math.max(prev.bestRank, stats.bestRank),
          mostCells: Math.max(prev.mostCells, stats.cells),
          longestRun: Math.max(prev.longestRun, Math.round(stats.seconds)),
          totalEaten: prev.totalEaten + stats.cells,
          gamesPlayed: prev.gamesPlayed + 1,
        }));
      }
    }
  }, [snapshot.stats, snapshot.phase, record, notify]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    let width = window.innerWidth;
    let height = window.innerHeight;
    let ratio = Math.min(window.devicePixelRatio || 1, 2);
    let animation = 0;
    let previous = performance.now();
    let lastSnapshot = 0;
    let frames = 0;
    let fpsAt = previous;
    let debugAt = 0;
    const showDebug = new URLSearchParams(window.location.search).has('debug');
    engine.aiDebug = showDebug;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      engine.width = width;
      engine.height = height;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    const frame = (now: number) => {
      const delta = Math.min(BALANCE.appFrameDt, (now - previous) / 1000);
      previous = now;
      engine.update(delta);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      renderArena(ctx, engine, width, height, preferencesRef.current, media.matches);
      frames++;
      if (now - fpsAt >= 500) {
        if (showDebug) setFps(Math.round(frames * 1000 / (now - fpsAt)));
        frames = 0;
        fpsAt = now;
      }
      if (now - lastSnapshot > 120) {
        setSnapshot(engine.snapshot());
        if (preferencesRef.current.minimap) {
          const mini = miniRef.current;
          const miniCtx = mini?.getContext('2d');
          if (mini && miniCtx) {
            miniCtx.setTransform(2, 0, 0, 2, 0, 0);
            renderMinimap(miniCtx, engine, 152, preferencesRef.current.dark);
          }
        }
        lastSnapshot = now;
      }
      if (showDebug && now - debugAt > 500) {
        setDiagnostics(engine.diagnostics());
        const report = engine.aiReport();
        setAiLine(`ai farm=${Math.round(report.stateShare.farm * 100)}% hunt=${Math.round(report.stateShare.hunt * 100)}% flee=${Math.round(report.stateShare.flee * 100)}% deaths=${report.deaths} avoidable=${report.avoidableDeaths} osc=${report.oscillations} q=${Math.round(report.decisionQuality * 100)}%`);
        debugAt = now;
      }
      animation = requestAnimationFrame(frame);
    };
    animation = requestAnimationFrame(frame);
    const onWheel = (event: WheelEvent) => {
      if (engine.phase === 'lobby' || engine.paused) return;
      event.preventDefault();
      engine.zoomOffset = Math.max(0.65, Math.min(1.35, engine.zoomOffset - event.deltaY * 0.001));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      cancelAnimationFrame(animation);
      observer.disconnect();
      canvas.removeEventListener('wheel', onWheel);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [engine]);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement).tagName;
      const inField = ['INPUT', 'SELECT', 'TEXTAREA'].includes(tag);
      if (event.key === 'Escape') {
        event.preventDefault();
        if (popupRef.current) openPopup(null);
        else if (engine.phase === 'playing' || engine.phase === 'spectating') openPopup('pause');
        return;
      }
      if (inField || popupRef.current || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'Tab' && engine.phase === 'spectating') { event.preventDefault(); engine.spectateNext(event.shiftKey ? -1 : 1); }
      if (engine.phase !== 'playing' || engine.paused) return;
      const key = event.key.toLowerCase();
      if (key === ' ' && tag === 'BUTTON') return;
      if (key === ' ' || key.startsWith('arrow')) event.preventDefault();
      engine.keys.add(key);
      if (key === ' ' && !event.repeat && tag !== 'BUTTON') split();
      if (key === 'w' && !event.repeat) engine.eject();
      if (key === '1') engine.triggerEmote('cool');
      if (key === '2') engine.triggerEmote('panic');
      if (key === '3') engine.triggerEmote('devil');
      if (key === '4') engine.triggerEmote('crown');
      if (key === '5') engine.triggerEmote('heart');
      if (key === '6') engine.triggerEmote('lightning');
    };
    const keyUp = (event: KeyboardEvent) => engine.keys.delete(event.key.toLowerCase());
    const onBlur = () => {
      engine.keys.clear();
      engine.pointer = { x: 0, y: 0 };
      if (engine.phase === 'playing' && !engine.paused) openPopup('pause');
    };
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
  }, [engine, openPopup, split]);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (rootRef.current?.requestFullscreen) await rootRef.current.requestFullscreen();
      else notify('Trình duyệt này chưa hỗ trợ chế độ toàn màn hình.');
    } catch { notify('Không thể mở toàn màn hình trong cửa sổ này.'); }
  };

  return (
    <main ref={rootRef} className={`agar-app ${preferences.dark ? 'dark-arena' : ''} ${lobby ? 'is-lobby' : 'is-game'}`}>
      <canvas
        ref={canvasRef}
        className="arena-canvas"
        aria-label="Đấu trường Agar.io. Di chuyển chuột để điều khiển, Space để tách, W để phóng khối lượng."
        tabIndex={0}
        onPointerDown={event => {
          if (event.pointerType !== 'touch') return;
          event.currentTarget.setPointerCapture(event.pointerId);
          touchOrigin.current = { x: event.clientX, y: event.clientY };
          setTouch({ x: event.clientX, y: event.clientY, dx: 0, dy: 0 });
        }}
        onPointerMove={event => {
          if (engine.paused) return;
          if (event.pointerType === 'touch' && touchOrigin.current) {
            const dx = event.clientX - touchOrigin.current.x;
            const dy = event.clientY - touchOrigin.current.y;
            const length = Math.hypot(dx, dy) || 1;
            engine.pointer = { x: dx * 3, y: dy * 3 };
            setTouch({ ...touchOrigin.current, dx: dx / length * Math.min(38, length), dy: dy / length * Math.min(38, length) });
          } else if (event.pointerType !== 'touch') engine.pointer = { x: event.clientX - engine.width / 2, y: event.clientY - engine.height / 2 };
        }}
        onPointerUp={event => {
          if (event.pointerType === 'touch') { touchOrigin.current = null; setTouch(null); engine.pointer = { x: 0, y: 0 }; }
        }}
        onPointerCancel={() => { touchOrigin.current = null; setTouch(null); engine.pointer = { x: 0, y: 0 }; }}
        onContextMenu={event => event.preventDefault()}
      />

      <header className="arena-header">
        <div className="header-brand-group">
          <button className="wordmark-small" aria-label="Agar.io, về sảnh" onClick={() => playing || spectating ? openPopup('pause') : returnToLobby()}>agar<span>.</span>io</button>
          <div className="header-divider" />
          <span className="server-status"><i />Đấu trường cục bộ<span className="server-bots">{BALANCE.botCount} bot</span></span>
        </div>
        <nav className="header-actions" aria-label="Công cụ trò chơi">
          {(playing || spectating) && <IconButton icon="pause" title="Tạm dừng" onClick={() => openPopup('pause')} />}
          <IconButton icon={preferences.sound ? 'sound' : 'muted'} title={preferences.sound ? 'Tắt âm thanh' : 'Bật âm thanh'} onClick={() => togglePreference('sound')} />
          <IconButton icon="settings" title="Cài đặt" onClick={() => openPopup('settings')} />
          <IconButton icon="help" title="Cách chơi" onClick={() => openPopup('help')} />
        </nav>
      </header>

      <aside className={`leaderboard ${collapsed ? 'is-collapsed' : ''}`} aria-label="Bảng xếp hạng">
        <button className="leaderboard-title" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>
          <span><Icon name="trophy" size={17} />Bảng xếp hạng</span><Icon name="chevron" size={15} />
        </button>
        {!collapsed && <>
          <div className="leaderboard-label"><span>{engine.mode === 'teams' ? 'ĐỒNG ĐỘI' : 'TOP 10 TẾ BÀO'}</span><span className="live-label"><i />LOCAL</span></div>
          {engine.mode === 'teams' && !lobby && <div className="team-share" aria-label="Thị phần các đội">{snapshot.teamShares.map((share, index) => <span key={index} style={{ background: TEAM_COLORS[index], width: `${share * 100}%` }} title={`${['Đỏ', 'Xanh dương', 'Xanh lá'][index]}: ${Math.round(share * 100)}%`} />)}</div>}
          <ol className="leader-list">
            {snapshot.leaders.map((leader, index) => <li key={leader.id} className={leader.player ? 'leader-is-player' : ''}>
              <span className={`leader-rank ${index === 0 ? 'rank-first' : ''}`}>{index + 1}</span>
              <i className="leader-color" style={{ background: leader.color }} />
              <span className="leader-name">{leader.name}{leader.player && <small> (bạn)</small>}</span>
              <span className="leader-mass">{number(leader.mass)}</span>
            </li>)}
          </ol>
          <div className="leaderboard-you">
            <span className="you-dot" style={{ background: playing ? engine.player.color : undefined }} />
            {playing ? <><span>Bạn đang đứng thứ <strong>#{snapshot.rank}</strong></span><span>{number(snapshot.score)}</span></> : <span>{spectating ? 'Bạn đang quan sát' : 'Sẵn sàng ghi tên mình?'}</span>}
          </div>
        </>}
      </aside>

      {lobby && <section className="lobby-position" aria-label="Bắt đầu chơi">
        <div className="lobby-panel">
          <div className="lobby-brand">
            <div className="brand-orbits" aria-hidden="true"><i /><i /><i /></div>
            <h1 className="wordmark">agar<span>.</span>io</h1>
            <p>Bắt đầu nhỏ. Lớn lên không giới hạn.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 13px', background: 'var(--subtle)', borderRadius: '10px', marginBottom: '16px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '50%', background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: '11px' }}>{levelInfo.level}</span>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <strong style={{ fontSize: '11px', lineHeight: 1.2 }}>{levelInfo.title}</strong>
                <small style={{ fontSize: '9px', color: 'var(--muted)' }}>{number(levelInfo.currentExp)} / {number(levelInfo.nextLevelExp)} EXP</small>
              </div>
            </div>
            <div style={{ width: '70px', height: '5px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, Math.round((levelInfo.currentExp / (levelInfo.nextLevelExp || 1)) * 100))}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.4s' }} />
            </div>
          </div>
          <form onSubmit={play}>
            <label className="field-label" htmlFor="nickname">BIỆT DANH CỦA BẠN</label>
            <div className="nickname-row" style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px' }}>
              <div className="nickname-field" style={{ flex: 1 }}>
                <input id="nickname" autoComplete="off" maxLength={18} placeholder="Bạn tên gì?" value={nickname} onChange={event => setNickname(event.target.value)} />
                <span className="input-cell-dot" style={{ background: color }} aria-hidden="true" />
              </div>
              <button type="button" className="icon-button" title="Biệt danh ngẫu nhiên" style={{ height: '49px', width: '49px', borderRadius: '9px', flexShrink: 0 }} onClick={() => setNickname(randomNickname())}>
                <Icon name="restart" size={18} />
              </button>
            </div>
            <div className="lobby-selects">
              <div className="mode-control"><label className="field-label" htmlFor="game-mode">CHẾ ĐỘ CHƠI</label><div className="select-wrap"><Icon name={mode === 'boss' ? 'trophy' : mode === 'teams' ? 'users' : mode === 'experimental' ? 'leaf' : mode === 'royale' ? 'target' : mode === 'turbo' ? 'restart' : 'globe'} size={17} /><select id="game-mode" value={mode} onChange={event => setMode(event.target.value as GameMode)}><option value="ffa">Tự do (FFA)</option><option value="teams">Đồng đội</option><option value="experimental">Thử nghiệm</option><option value="royale">Sinh tồn (Royale)</option><option value="turbo">Siêu tốc độ (Turbo)</option><option value="boss">⚔️ Săn Boss Titan</option></select><Icon name="chevron" size={14} /></div></div>
              <div className="skin-control"><span className="field-label">DIỆN MẠO</span><button type="button" className="skin-select" onClick={() => openPopup('skins')}><CellPreview size={29} color={skin === 'classic' ? color : currentSkin.color} skin={skin} /><span>{skin === 'classic' ? 'Đổi skin' : currentSkin.name}</span><Icon name="chevron" size={13} /></button></div>
            </div>
            <button type="submit" className="primary-button play-button"><Icon name="play" size={20} /><span>Vào đấu trường</span><Icon name="arrow" size={19} /></button>
            <button type="button" className="secondary-button spectate-button" onClick={() => { engine.spectate(mode); setSnapshot(engine.snapshot()); }}><Icon name="eye" size={19} /><span>Quan sát</span></button>
          </form>
          <div className="lobby-note"><span className="note-dot" />Miễn phí. Không tài khoản. Chỉ cần chơi.</div>
          <div className="lobby-controls">
            <span><Icon name="mouse" size={19} /><small>Di chuyển</small></span>
            <span><kbd>SPACE</kbd><small>Tách đôi</small></span>
            <span><kbd>W</kbd><small>Phóng khối</small></span>
            <span><kbd>1-6</kbd><small>Biểu cảm</small></span>
          </div>
          <div className="achievement-strip" style={{ cursor: 'pointer' }} onClick={() => openPopup('codex')} title="Bấm để xem Bách khoa Thành tựu & Cấp độ">
            <Icon name="trophy" size={15} />
            <span>{achievements.length}/{ACHIEVEMENTS.length} thành tựu · Cấp {levelInfo.level} {best.gamesPlayed > 0 ? `· ${best.gamesPlayed} ván` : ''}</span>
          </div>
        </div>
        <div className="lobby-caption">Ăn những tế bào nhỏ hơn. Tránh những kẻ lớn hơn.</div>
      </section>}

      {playing && <>
        {snapshot.boss && snapshot.boss.alive && (
          <div style={{
            position: 'absolute',
            top: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 15,
            width: '320px',
            maxWidth: '90vw',
            background: 'rgba(20, 12, 36, 0.94)',
            border: '2px solid #a855f7',
            borderRadius: '12px',
            padding: '8px 14px',
            boxShadow: '0 4px 20px rgba(168, 85, 247, 0.4)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            backdropFilter: 'blur(8px)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#c084fc', fontSize: '11px', fontWeight: 800, letterSpacing: '1px' }}>⚔️ KRAKEN TITAN</span>
              <span style={{ color: '#fff', fontSize: '11px', fontWeight: 700 }}>{number(snapshot.boss.mass)} / {number(snapshot.boss.maxMass)}</span>
            </div>
            <div style={{ width: '100%', height: '8px', background: 'rgba(0,0,0,0.5)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{
                width: `${Math.min(100, Math.max(0, (snapshot.boss.mass / snapshot.boss.maxMass) * 100))}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #9333ea, #ec4899)',
                transition: 'width 0.2s ease',
              }} />
            </div>
          </div>
        )}
        {snapshot.meteorAlert && snapshot.meteorAlert.active && (
          <div style={{
            position: 'absolute',
            top: snapshot.boss?.alive ? '68px' : '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 14,
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.95), rgba(217, 119, 6, 0.95))',
            color: '#fff',
            padding: '5px 14px',
            borderRadius: '20px',
            fontSize: '11px',
            fontWeight: 700,
            boxShadow: '0 4px 15px rgba(245, 158, 11, 0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            whiteSpace: 'nowrap',
          }}>
            <span>☄️ SAO BĂNG ĐÁNH XUỐNG: {snapshot.meteorAlert.timeRemaining.toFixed(1)}s</span>
          </div>
        )}
        <div className="in-game-status">
          <span className="status-dot" />{MODE_LABELS[engine.mode]}<span className="status-separator">/</span><span>{duration(snapshot.stats.seconds)}</span>
          {snapshot.cells > 1 && <span className="merge-indicator">{snapshot.cells} tế bào{snapshot.mergeIn > 0 ? ` · Hợp sau ${snapshot.mergeIn}s` : ' · Sẵn sàng hợp'}</span>}
          {snapshot.speedBoostRemaining && snapshot.speedBoostRemaining > 0 ? (
            <span style={{ marginLeft: '8px', padding: '3px 8px', borderRadius: '6px', background: '#00cec9', color: '#fff', fontSize: '10px', fontWeight: 600 }}>⚡ Tăng tốc {Math.ceil(snapshot.speedBoostRemaining)}s</span>
          ) : null}
          {engine.mode === 'royale' && snapshot.royaleRadius ? (
            <span style={{ marginLeft: '8px', padding: '3px 8px', borderRadius: '6px', background: '#a855f7', color: '#fff', fontSize: '10px', fontWeight: 600 }}>Vòng bo: {Math.round(snapshot.royaleRadius)}m</span>
          ) : null}
        </div>
        {snapshot.combatNotices && snapshot.combatNotices.length > 0 && (
          <div className="combat-feed" style={{ position: 'absolute', top: '96px', right: '35px', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '6px', pointerEvents: 'none', maxWidth: '320px' }}>
            {snapshot.combatNotices.slice(-4).map(notice => (
              <div key={notice.id} style={{
                background: notice.highlight ? 'linear-gradient(135deg, rgba(235, 136, 94, 0.95), rgba(225, 121, 80, 0.95))' : 'rgba(32, 37, 44, 0.88)',
                color: '#ffffff',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '11px',
                fontWeight: notice.highlight ? 700 : 500,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                animation: 'caption-enter 0.25s ease-out',
                backdropFilter: 'blur(6px)',
              }}>
                {notice.highlight ? <Icon name="trophy" size={14} /> : <Icon name="target" size={13} />}
                <span>{notice.text}</span>
              </div>
            ))}
          </div>
        )}
        <div className="playing-controls"><span><Icon name="mouse" size={16} />Di chuyển</span><span><kbd>SPACE</kbd>Tách</span><span><kbd>W</kbd>Phóng khối</span><span><kbd>1-6</kbd>Biểu cảm</span><span><kbd>ESC</kbd>Tạm dừng</span></div>
        {snapshot.stats.seconds < 4.8 && <div className="spawn-hint"><Icon name="leaf" size={15} />Bạn được bảo vệ trong 5 giây đầu</div>}
        <div className="emote-bar" style={{
          position: 'absolute',
          bottom: '22px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: '6px',
          background: 'rgba(15, 23, 42, 0.85)',
          padding: '5px 12px',
          borderRadius: '30px',
          border: '1px solid rgba(255,255,255,0.18)',
          backdropFilter: 'blur(8px)',
          zIndex: 12,
        }}>
          {[
            { kind: 'cool', emoji: '😎', key: '1' },
            { kind: 'panic', emoji: '😱', key: '2' },
            { kind: 'devil', emoji: '😈', key: '3' },
            { kind: 'crown', emoji: '👑', key: '4' },
            { kind: 'heart', emoji: '❤️', key: '5' },
            { kind: 'lightning', emoji: '⚡', key: '6' },
          ].map(item => (
            <button
              key={item.kind}
              type="button"
              title={`Biểu cảm ${item.emoji} (Phím ${item.key})`}
              onClick={() => engine.triggerEmote(item.kind as any)}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '19px',
                cursor: 'pointer',
                padding: '2px 4px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {item.emoji}
            </button>
          ))}
        </div>
        <div className="touch-actions">
          <button onClick={() => { if (navigator.vibrate) navigator.vibrate(20); split(); }} aria-label="Tách tế bào" style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(235, 136, 94, 0.92)', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.25)', border: '2px solid rgba(255,255,255,0.4)' }}><Icon name="split" size={24} /><span style={{ fontSize: '9px', fontWeight: 700, marginTop: '2px' }}>TÁCH</span></button>
          <button aria-label="Phóng khối lượng" onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); if (navigator.vibrate) navigator.vibrate(15); engine.keys.add('w'); engine.eject(); }} onPointerUp={() => engine.keys.delete('w')} onPointerCancel={() => engine.keys.delete('w')} style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(52, 73, 94, 0.92)', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.25)', border: '2px solid rgba(255,255,255,0.4)' }}><Icon name="eject" size={24} /><span style={{ fontSize: '9px', fontWeight: 700, marginTop: '2px' }}>BẮN</span></button>
        </div>
      </>}

      {spectating && <div className="spectate-toolbar"><div><span className="eyebrow">ĐANG QUAN SÁT</span><strong>{snapshot.spectating}</strong></div><button className="text-button" onClick={() => engine.spectateNext()}>Tế bào tiếp theo<Icon name="arrow" size={18} /></button><button className="primary-button compact-button" onClick={() => play()}>Tham gia</button><IconButton icon="close" title="Dừng quan sát" onClick={returnToLobby} /></div>}

      <div className="score-area">
        <div className="score-label"><Icon name={playing ? 'target' : 'trophy'} size={15} />{playing ? 'KHỐI LƯỢNG' : 'KỶ LỤC CỦA BẠN'}</div>
        <div className="score-number">{number(playing ? snapshot.score : record)}<span>{playing ? 'điểm' : 'điểm tốt nhất'}</span></div>
        {playing && <div className="best-score">Kỷ lục <strong>{number(record)}</strong></div>}
      </div>

      {preferences.minimap && <aside className="minimap-panel" aria-label="Bản đồ đấu trường"><div className="minimap-heading"><span>BẢN ĐỒ</span><Icon name="target" size={13} /></div><canvas ref={miniRef} width={304} height={304} aria-label="Vị trí các tế bào trên bản đồ" /><span className="minimap-coordinates">{lobby ? 'MỘT THẾ GIỚI, VÔ SỐ KHẢ NĂNG' : `${Math.round(engine.camera.x)}, ${Math.round(engine.camera.y)}`}</span></aside>}

      <footer className="arena-footer"><div><span className="footer-dot" /><button onClick={() => openPopup('about')}>Bản cộng đồng</button><span className="footer-divider">/</span><span>Chơi cùng bot</span></div><div className="footer-links"><button onClick={() => openPopup('help')}>Cách chơi</button><span className="footer-divider">·</span><button onClick={() => openPopup('about')}>Giới thiệu</button></div><button className="fullscreen-button" title={fullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'} onClick={toggleFullscreen}><Icon name="expand" size={16} /><span>{fullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}</span></button></footer>

      {touch && playing && <div className="touch-joystick" style={{ left: touch.x, top: touch.y }}><span style={{ transform: `translate(${touch.dx}px, ${touch.dy}px)` }} /></div>}
      {toast && <div className="toast-message" role="status"><Icon name="info" size={17} />{toast}</div>}
      {debug && <DebugOverlay fps={fps} diagnostics={diagnostics} violations={engine.validateInvariants().length} aiLine={aiLine} />}

      {snapshot.phase === 'ended' && !popup && <div className="result-backdrop"><section className="result-panel" aria-labelledby="result-title"><div className="result-bubbles" aria-hidden="true"><i /><i /><i /></div><span className="eyebrow">{snapshot.royaleWinner ? '👑 VICTORY ROYALE!' : 'MỖI KẾT THÚC LÀ MỘT KHỞI ĐẦU'}</span><h2 id="result-title">{snapshot.royaleWinner ? 'Quán quân Đấu trường!' : 'Một vòng nữa nhé?'}</h2><p>{snapshot.royaleWinner ? 'Bạn đã đánh bại mọi đối thủ và sống sót cuối cùng!' : <><strong>{snapshot.stats.eatenBy || 'Một tế bào lớn'}</strong> đã nuốt bạn. Lần sau sẽ khác!</>}</p><div className="result-score"><span>KHỐI LƯỢNG CAO NHẤT</span><strong>{number(snapshot.stats.peak)}</strong><small>{snapshot.stats.peak >= record ? 'Một kỷ lục đáng tự hào!' : `Kỷ lục của bạn: ${number(record)}`}</small></div><div className="result-stats"><div><strong>{duration(snapshot.stats.seconds)}</strong><span>Sống sót</span></div><div><strong>{number(snapshot.stats.food)}</strong><span>Hạt đã ăn</span></div><div><strong>{snapshot.stats.cells}</strong><span>Tế bào đã nuốt</span></div></div><div style={{ margin: '14px 0', padding: '10px 14px', background: 'var(--subtle)', borderRadius: '10px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><div><strong style={{ fontSize: '13px' }}>+ {number(lastEarnedExp)} EXP</strong><div style={{ fontSize: '10px', color: 'var(--muted)' }}>Cấp độ {levelInfo.level} · {levelInfo.title}</div></div><span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)' }}>{number(levelInfo.currentExp)}/{number(levelInfo.nextLevelExp)}</span></div><button className="primary-button" onClick={() => play()}><Icon name="restart" size={19} />Chơi lại</button><button className="secondary-button" onClick={returnToLobby}><Icon name="home" size={17} />Về sảnh</button></section></div>}

      {popup === 'settings' && <Modal title="Theo cách của bạn" subtitle="Một vài điều chỉnh nhỏ, một trải nghiệm tốt hơn." icon="settings" onClose={() => openPopup(null)}><div className="settings-list">{([
        ['dark', 'Chế độ tối', 'Dịu mắt hơn khi chơi vào ban đêm.', 'moon'],
        ['names', 'Tên tế bào', 'Biết ai đang bơi quanh mình.', 'users'],
        ['mass', 'Hiện khối lượng', 'Hiển thị điểm trên mỗi tế bào.', 'target'],
        ['grid', 'Lưới đấu trường', 'Giúp bạn định hướng trên bản đồ.', 'globe'],
        ['minimap', 'Bản đồ nhỏ', 'Nhìn toàn cảnh ở góc màn hình.', 'expand'],
        ['quality', 'Chuyển động mềm', 'Viền tế bào sống động và hiệu ứng hạt.', 'leaf'],
        ['sound', 'Âm thanh', 'Tiếng ăn hạt, tách và phóng tế bào.', 'sound'],
      ] as [keyof Preferences, string, string, IconName][]).map(([key, label, description, icon]) => <div className="setting-row" key={key}><span className="setting-icon"><Icon name={icon} size={19} /></span><div><strong id={`setting-${key}`}>{label}</strong><small>{description}</small></div><button className={`toggle-switch ${preferences[key] ? 'is-on' : ''}`} role="switch" aria-checked={preferences[key]} aria-labelledby={`setting-${key}`} onClick={() => togglePreference(key)}><span /></button></div>)}</div><div className="volume-row"><span className="setting-icon"><Icon name={preferences.sound ? 'sound' : 'muted'} size={19} /></span><div><strong id="setting-volume">Âm lượng</strong><small>{Math.round(volume * 100)}% — áp dụng cho mọi hiệu ứng.</small></div><input id="setting-volume" className="volume-slider" type="range" min={0} max={100} value={Math.round(volume * 100)} aria-label="Âm lượng hiệu ứng" onChange={event => { const next = Number(event.target.value) / 100; setVolume(next); arenaSound.setVolume(next); }} /></div><div className="modal-footnote"><Icon name="check" size={14} />Tùy chọn được tự động lưu trên thiết bị này.</div></Modal>}

      {popup === 'skins' && <Modal title="Một chút cá tính" subtitle="Chọn diện mạo cho tế bào của bạn. Tất cả đều miễn phí." icon="palette" onClose={() => openPopup(null)}><div className="skin-grid">{SKINS.map(item => <button className={`skin-option ${skin === item.id ? 'is-selected' : ''}`} key={item.id} aria-pressed={skin === item.id} onClick={() => { setSkin(item.id); if (playing) { engine.player.skin = engine.mode === 'teams' ? 'classic' : item.id; engine.player.color = engine.mode === 'teams' ? TEAM_COLORS[engine.player.team] : item.id === 'classic' ? color : item.color; } }}><div style={{ position: 'relative' }}><CellPreview size={76} skin={item.id} color={item.id === 'classic' ? color : item.color} />{item.legendary && <span style={{ position: 'absolute', top: '-4px', right: '-4px', background: 'linear-gradient(135deg, #f59e0b, #ef4444)', color: '#fff', fontSize: '8px', fontWeight: 800, padding: '1px 5px', borderRadius: '4px', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>VIP</span>}</div><span>{item.name}</span>{skin === item.id && <span className="skin-check"><Icon name="check" size={12} /></span>}</button>)}</div><div className="color-picker"><span className="field-label">MÀU NGUYÊN BẢN</span><div>{CELL_COLORS.map(value => <button key={value} aria-label={`Chọn màu ${value}`} aria-pressed={color === value} className={color === value ? 'color-is-selected' : ''} style={{ background: value }} onClick={() => { setColor(value); setSkin('classic'); if (playing && engine.mode !== 'teams') { engine.player.skin = 'classic'; engine.player.color = value; } }}>{color === value && <Icon name="check" size={16} />}</button>)}</div></div>{playing && engine.mode === 'teams' && <p className="mode-note">Chế độ đồng đội sử dụng màu chung của đội.</p>}<button className="primary-button" onClick={() => openPopup(null)}>Đẹp rồi, chơi thôi<Icon name="arrow" size={18} /></button></Modal>}

      {popup === 'help' && <Modal title="Nhỏ thôi. Nhưng có võ." subtitle="Một luật đơn giản: lớn hơn thì ăn được nhỏ hơn." icon="help" onClose={() => openPopup(null)}><div className="help-demo"><CellPreview size={88} color="#a18add" skin="classic" /><div className="help-dots"><i /><i /><i /></div><CellPreview size={43} color="#edbb66" skin="classic" /></div><div className="help-rows"><div><Icon name="mouse" /><p><strong>Di chuyển chuột để bơi</strong><span>Ăn hạt màu để lớn lên. Trên điện thoại, kéo ngón tay trên joystick ảo để bơi.</span></p></div><div><kbd>SPACE</kbd><p><strong>Tách để bắt kịp đối thủ</strong><span>Cần 40 khối lượng. Tối đa 16 tế bào, tự hợp lại sau một khoảng thời gian.</span></p></div><div><kbd>W</kbd><p><strong>Phóng khối lượng</strong><span>Cho đồng đội ăn hoặc bắn vào virus. Mỗi lần phóng tiêu hao 12 điểm.</span></p></div><div><span className="virus-help-icon" /><p><strong>Cẩn thận với virus xanh</strong><span>Núp sau virus khi còn nhỏ. Tế bào trên 165 điểm có thể bị nổ thành nhiều mảnh.</span></p></div><div><Icon name="target" /><p><strong>Sinh tồn Vòng Bo (Royale)</strong><span>Vòng bo năng lượng co dần về tâm. Hãy ở trong vòng an toàn để không bị hao mòn!</span></p></div><div><Icon name="restart" /><p><strong>Hạt năng lượng đặc biệt</strong><span>Hạt vàng hoàng kim (+25 điểm) và Hạt xanh ngọc (tăng tốc lướt trong 4 giây).</span></p></div></div><div className="help-shortcuts"><span><kbd>ESC</kbd>Tạm dừng</span><span><Icon name="mouse" size={15} />Lăn chuột để thu phóng</span><span><kbd>TAB</kbd>Đổi người xem</span></div><button className="primary-button" onClick={() => openPopup(null)}>Hiểu rồi<Icon name="check" size={18} /></button></Modal>}

      {popup === 'about' && <Modal title="Những vòng tròn, niềm vui lớn." subtitle="Một lời tri ân trò chơi tế bào quen thuộc." icon="info" onClose={() => openPopup(null)}><div className="about-copy"><p>Đây là bản tái hiện Agar.io do cộng đồng xây dựng, không phải trang web chính thức và không liên kết với nhà phát hành Agar.io.</p><p>Đấu trường chạy ngay trên trình duyệt với <strong>48 bot tự điều khiển</strong>. Không có người chơi trực tuyến, không tài khoản, không giao dịch.</p><h3>Chọn cách bạn chơi</h3><p><strong>Tự do:</strong> mọi tế bào đều là đối thủ.<br /><strong>Đồng đội:</strong> ba đội, không nuốt người cùng màu.<br /><strong>Thử nghiệm:</strong> thêm tế bào mẹ màu hồng sinh hạt và nuốt tế bào nhỏ.</p><p className="about-small">Kỷ lục, biệt danh và cài đặt được lưu cục bộ. Không có dữ liệu nào được gửi đến máy chủ trò chơi.</p></div><button className="primary-button" onClick={() => openPopup(null)}>Trở lại đấu trường<Icon name="arrow" size={18} /></button></Modal>}

      {popup === 'pause' && <Modal title="Nghỉ một nhịp." subtitle="Đấu trường đang tạm dừng. Tế bào của bạn vẫn an toàn." icon="pause" onClose={() => openPopup(null)}>
        <div className="pause-preview">
          <CellPreview size={95} color={engine.player.color} skin={engine.player.skin} />
          <strong>{spectating ? snapshot.spectating : engine.player.name}</strong>
          <span>{spectating ? 'Chế độ quan sát' : `${number(snapshot.score)} khối lượng`}</span>
        </div>
        <div className="pause-buttons">
          <button className="primary-button" onClick={() => openPopup(null)}><Icon name="play" size={19} />{spectating ? 'Tiếp tục quan sát' : 'Tiếp tục chơi'}</button>
          <div className="pause-options">
            <button className="secondary-button" onClick={() => openPopup('settings')}><Icon name="settings" size={18} />Cài đặt</button>
            <button className="secondary-button" onClick={() => openPopup('skins')}><Icon name="palette" size={18} />Diện mạo</button>
          </div>
          <button className="text-button" onClick={returnToLobby}><Icon name="home" size={17} />Kết thúc và về sảnh</button>
        </div>
      </Modal>}

      {popup === 'codex' && <Modal title="Bách Khoa Thành Tựu & Cấp Độ" subtitle={`Cấp độ ${levelInfo.level} · ${levelInfo.title} · ${achievements.length}/${ACHIEVEMENTS.length} Thành tựu`} icon="trophy" onClose={() => openPopup(null)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ padding: '14px', background: 'var(--subtle)', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div>
                <strong style={{ fontSize: '15px' }}>{levelInfo.title}</strong>
                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Cấp độ {levelInfo.level} / 50</div>
              </div>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent)' }}>{number(levelInfo.currentExp)} / {number(levelInfo.nextLevelExp)} EXP</span>
            </div>
            <div style={{ width: '100%', height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, Math.round((levelInfo.currentExp / (levelInfo.nextLevelExp || 1)) * 100))}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent), #f59e0b)', transition: 'width 0.4s' }} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
            <div style={{ padding: '8px 12px', background: 'var(--subtle)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Kỷ lục khối lượng</div>
              <strong style={{ fontSize: '14px' }}>{number(best.bestMass)}</strong>
            </div>
            <div style={{ padding: '8px 12px', background: 'var(--subtle)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Thứ hạng tốt nhất</div>
              <strong style={{ fontSize: '14px' }}>{best.bestRank > 0 ? `#${best.bestRank}` : '—'}</strong>
            </div>
            <div style={{ padding: '8px 12px', background: 'var(--subtle)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Sống sót lâu nhất</div>
              <strong style={{ fontSize: '14px' }}>{duration(best.longestRun)}</strong>
            </div>
            <div style={{ padding: '8px 12px', background: 'var(--subtle)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Tổng hạt đã ăn</div>
              <strong style={{ fontSize: '14px' }}>{number(best.totalEaten)}</strong>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '8px', maxHeight: '280px', overflowY: 'auto', paddingRight: '4px' }}>
            {ACHIEVEMENTS.map(ach => {
              const unlocked = achievements.includes(ach.id);
              return (
                <div key={ach.id} style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: unlocked ? 'rgba(34, 197, 94, 0.08)' : 'var(--subtle)',
                  border: unlocked ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: unlocked ? '#22c55e' : 'var(--border)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Icon name={unlocked ? 'check' : 'trophy'} size={16} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <strong style={{ fontSize: '12px', color: unlocked ? 'var(--text)' : 'var(--muted)' }}>{ach.name}</strong>
                    <small style={{ fontSize: '10px', color: 'var(--muted)' }}>{ach.hint}</small>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Modal>}
    </main>
  );
}

function IconButton({ icon, title, onClick }: { icon: IconName; title: string; onClick: () => void }) {
  return <button className="icon-button" title={title} aria-label={title} onClick={onClick}><Icon name={icon} size={19} /></button>;
}

function DebugOverlay({ fps, diagnostics, violations, aiLine }: {
  fps: number;
  diagnostics: {
    time: number;
    cells: number;
    food: number;
    ejected: number;
    viruses: number;
    particles: number;
    floaters: number;
    zoom: number;
    aiTimeMs: number;
    aiDecisions: number;
    aiAverageMs: number;
    aiSlowestMs: number;
    stepAverageMs: number;
  };
  violations: number;
  aiLine: string;
}) {
  return (
    <div className="debug-overlay" aria-hidden="true">
      <span>FPS {fps}</span>
      <span>t={diagnostics.time.toFixed(1)}s</span>
      <span>cells={diagnostics.cells}</span>
      <span>food={diagnostics.food}</span>
      <span>eject={diagnostics.ejected}</span>
      <span>virus={diagnostics.viruses}</span>
      <span>fx={diagnostics.particles + diagnostics.floaters}</span>
      <span>zoom={diagnostics.zoom.toFixed(2)}</span>
      <span>ai={diagnostics.aiAverageMs.toFixed(2)}ms ({diagnostics.aiDecisions})</span>
      <span>step={diagnostics.stepAverageMs.toFixed(2)}ms</span>
      <span className={diagnostics.aiSlowestMs > 8 ? 'debug-bad' : 'debug-ok'}>aiMax={diagnostics.aiSlowestMs.toFixed(1)}ms</span>
      <span className={violations ? 'debug-bad' : 'debug-ok'}>invariants={violations}</span>
      {aiLine && <span>{aiLine}</span>}
    </div>
  );
}

function CellPreview({ size, color, skin }: { size: number; color: string; skin: SkinId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, size, size);
    drawCell(ctx, size / 2, size / 2, size * 0.44, color, '', 0, skin, undefined, false);
  }, [size, color, skin]);
  return <canvas ref={ref} width={size * 2} height={size * 2} style={{ width: size, height: size }} aria-hidden="true" />;
}

function Modal({ title, subtitle, icon, onClose, children }: { title: string; subtitle: string; icon: IconName; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    const modal = ref.current;
    modal?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const elements = modal?.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, [tabindex="0"]');
      if (!elements?.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === modal)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === modal)) { event.preventDefault(); first.focus(); }
    };
    modal?.addEventListener('keydown', trap);
    return () => { modal?.removeEventListener('keydown', trap); before?.focus?.({ preventScroll: true }); };
  }, []);
  return <div className="modal-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}><section ref={ref} className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1}><div className="modal-top"><span className="modal-symbol"><Icon name={icon} size={23} /></span><IconButton icon="close" title="Đóng" onClick={onClose} /></div><h2 id="modal-title">{title}</h2><p className="modal-subtitle">{subtitle}</p>{children}</section></div>;
}