import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AgarEngine } from './agar/engine';
import { Icon, type IconName } from './agar/Icon';
import { drawCell, renderArena, renderMinimap } from './agar/renderer';
import { arenaSound } from './agar/sound';
import { CELL_COLORS, TEAM_COLORS, type ArenaSnapshot, type GameMode, type Preferences, type SkinId } from './agar/types';
import { BALANCE } from './agar/config';
import {
  ACHIEVEMENTS, SAVE_VERSION, earnedAchievements, loadSave, persistSave, sanitizeNickname, type BestStats,
} from './agar/storage';

type Popup = 'settings' | 'help' | 'skins' | 'about' | 'pause' | null;
const SKINS: { id: SkinId; name: string; color: string }[] = [
  { id: 'classic', name: 'Nguyên bản', color: '#ee7b58' },
  { id: 'earth', name: 'Trái đất', color: '#619fdb' },
  { id: 'smile', name: 'Vui vẻ', color: '#f3c866' },
  { id: 'melon', name: 'Dưa hấu', color: '#79b86e' },
  { id: 'planet', name: 'Sao Thổ', color: '#8476bb' },
  { id: '8ball', name: 'Bi số 8', color: '#42464e' },
  { id: 'sunset', name: 'Hoàng hôn', color: '#d492c6' },
  { id: 'checker', name: 'Ô bàn cờ', color: '#a69ccc' },
];
const MODE_LABELS: Record<GameMode, string> = { ffa: 'Tự do (FFA)', teams: 'Đồng đội', experimental: 'Thử nghiệm' };

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
      record, volume, preferences, achievements, best,
    });
  }, [preferences, nickname, mode, skin, color, record, volume, achievements, best]);

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
        const mini = miniRef.current;
        const miniCtx = mini?.getContext('2d');
        if (mini && miniCtx) {
          miniCtx.setTransform(2, 0, 0, 2, 0, 0);
          renderMinimap(miniCtx, engine, 152, preferencesRef.current.dark);
        }
        lastSnapshot = now;
      }
      if (showDebug && now - debugAt > 500) {
        setDiagnostics(engine.diagnostics());
        const report = engine.aiReport();
        setAiLine(`ai farm=${Math.round(report.stateShare.farm * 100)}% hunt=${Math.round(report.stateShare.hunt * 100)}% flee=${Math.round(report.stateShare.flee * 100)}% deaths=${report.deaths} avoidable=${report.avoidableDeaths} osc=${report.oscillations}`);
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
          <form onSubmit={play}>
            <label className="field-label" htmlFor="nickname">BIỆT DANH CỦA BẠN</label>
            <div className="nickname-field">
              <input id="nickname" autoComplete="off" maxLength={18} placeholder="Bạn tên gì?" value={nickname} onChange={event => setNickname(event.target.value)} />
              <span className="input-cell-dot" style={{ background: color }} aria-hidden="true" />
            </div>
            <div className="lobby-selects">
              <div className="mode-control"><label className="field-label" htmlFor="game-mode">CHẾ ĐỘ CHƠI</label><div className="select-wrap"><Icon name={mode === 'teams' ? 'users' : mode === 'experimental' ? 'leaf' : 'globe'} size={17} /><select id="game-mode" value={mode} onChange={event => setMode(event.target.value as GameMode)}><option value="ffa">Tự do (FFA)</option><option value="teams">Đồng đội</option><option value="experimental">Thử nghiệm</option></select><Icon name="chevron" size={14} /></div></div>
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
          </div>
          <div className="achievement-strip" title={achievements.length ? ACHIEVEMENTS.filter(entry => achievements.includes(entry.id)).map(entry => entry.name).join(' · ') : 'Chơi để mở khóa thành tựu'}>
            <Icon name="trophy" size={15} />
            <span>{achievements.length}/{ACHIEVEMENTS.length} thành tựu{best.gamesPlayed > 0 ? ` · ${best.gamesPlayed} ván đã chơi` : ''}</span>
          </div>
        </div>
        <div className="lobby-caption">Ăn những tế bào nhỏ hơn. Tránh những kẻ lớn hơn.</div>
      </section>}

      {playing && <>
        <div className="in-game-status"><span className="status-dot" />{MODE_LABELS[engine.mode]}<span className="status-separator">/</span><span>{duration(snapshot.stats.seconds)}</span>{snapshot.cells > 1 && <span className="merge-indicator">{snapshot.cells} tế bào{snapshot.mergeIn > 0 ? ` · Hợp sau ${snapshot.mergeIn}s` : ' · Sẵn sàng hợp'}</span>}</div>
        <div className="playing-controls"><span><Icon name="mouse" size={16} />Di chuyển</span><span><kbd>SPACE</kbd>Tách</span><span><kbd>W</kbd>Phóng khối</span><span><kbd>ESC</kbd>Tạm dừng</span></div>
        {snapshot.stats.seconds < 4.8 && <div className="spawn-hint"><Icon name="leaf" size={15} />Bạn được bảo vệ trong 5 giây đầu</div>}
        <div className="touch-actions"><button onClick={split} aria-label="Tách tế bào"><Icon name="split" size={26} /><span>Tách</span></button><button aria-label="Phóng khối lượng" onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); engine.keys.add('w'); engine.eject(); }} onPointerUp={() => engine.keys.delete('w')} onPointerCancel={() => engine.keys.delete('w')}><Icon name="eject" size={25} /><span>Phóng</span></button></div>
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

      {snapshot.phase === 'ended' && !popup && <div className="result-backdrop"><section className="result-panel" aria-labelledby="result-title"><div className="result-bubbles" aria-hidden="true"><i /><i /><i /></div><span className="eyebrow">MỖI KẾT THÚC LÀ MỘT KHỞI ĐẦU</span><h2 id="result-title">Một vòng nữa nhé?</h2><p><strong>{snapshot.stats.eatenBy || 'Một tế bào lớn'}</strong> đã nuốt bạn. Lần sau sẽ khác!</p><div className="result-score"><span>KHỐI LƯỢNG CAO NHẤT</span><strong>{number(snapshot.stats.peak)}</strong><small>{snapshot.stats.peak >= record ? 'Một kỷ lục đáng tự hào!' : `Kỷ lục của bạn: ${number(record)}`}</small></div><div className="result-stats"><div><strong>{duration(snapshot.stats.seconds)}</strong><span>Sống sót</span></div><div><strong>{number(snapshot.stats.food)}</strong><span>Hạt đã ăn</span></div><div><strong>{snapshot.stats.cells}</strong><span>Tế bào đã nuốt</span></div></div><button className="primary-button" onClick={() => play()}><Icon name="restart" size={19} />Chơi lại</button><button className="secondary-button" onClick={returnToLobby}><Icon name="home" size={17} />Về sảnh</button></section></div>}

      {popup === 'settings' && <Modal title="Theo cách của bạn" subtitle="Một vài điều chỉnh nhỏ, một trải nghiệm tốt hơn." icon="settings" onClose={() => openPopup(null)}><div className="settings-list">{([
        ['dark', 'Chế độ tối', 'Dịu mắt hơn khi chơi vào ban đêm.', 'moon'],
        ['names', 'Tên tế bào', 'Biết ai đang bơi quanh mình.', 'users'],
        ['mass', 'Hiện khối lượng', 'Hiển thị điểm trên mỗi tế bào.', 'target'],
        ['grid', 'Lưới đấu trường', 'Giúp bạn định hướng trên bản đồ.', 'globe'],
        ['minimap', 'Bản đồ nhỏ', 'Nhìn toàn cảnh ở góc màn hình.', 'expand'],
        ['quality', 'Chuyển động mềm', 'Viền tế bào sống động và hiệu ứng hạt.', 'leaf'],
        ['sound', 'Âm thanh', 'Tiếng ăn hạt, tách và phóng tế bào.', 'sound'],
      ] as [keyof Preferences, string, string, IconName][]).map(([key, label, description, icon]) => <div className="setting-row" key={key}><span className="setting-icon"><Icon name={icon} size={19} /></span><div><strong id={`setting-${key}`}>{label}</strong><small>{description}</small></div><button className={`toggle-switch ${preferences[key] ? 'is-on' : ''}`} role="switch" aria-checked={preferences[key]} aria-labelledby={`setting-${key}`} onClick={() => togglePreference(key)}><span /></button></div>)}</div><div className="volume-row"><span className="setting-icon"><Icon name={preferences.sound ? 'sound' : 'muted'} size={19} /></span><div><strong id="setting-volume">Âm lượng</strong><small>{Math.round(volume * 100)}% — áp dụng cho mọi hiệu ứng.</small></div><input id="setting-volume" className="volume-slider" type="range" min={0} max={100} value={Math.round(volume * 100)} aria-label="Âm lượng hiệu ứng" onChange={event => { const next = Number(event.target.value) / 100; setVolume(next); arenaSound.setVolume(next); }} /></div><div className="modal-footnote"><Icon name="check" size={14} />Tùy chọn được tự động lưu trên thiết bị này.</div></Modal>}

      {popup === 'skins' && <Modal title="Một chút cá tính" subtitle="Chọn diện mạo cho tế bào của bạn. Tất cả đều miễn phí." icon="palette" onClose={() => openPopup(null)}><div className="skin-grid">{SKINS.map(item => <button className={`skin-option ${skin === item.id ? 'is-selected' : ''}`} key={item.id} aria-pressed={skin === item.id} onClick={() => { setSkin(item.id); if (playing) { engine.player.skin = engine.mode === 'teams' ? 'classic' : item.id; engine.player.color = engine.mode === 'teams' ? TEAM_COLORS[engine.player.team] : item.id === 'classic' ? color : item.color; } }}><CellPreview size={76} skin={item.id} color={item.id === 'classic' ? color : item.color} /><span>{item.name}</span>{skin === item.id && <span className="skin-check"><Icon name="check" size={12} /></span>}</button>)}</div><div className="color-picker"><span className="field-label">MÀU NGUYÊN BẢN</span><div>{CELL_COLORS.map(value => <button key={value} aria-label={`Chọn màu ${value}`} aria-pressed={color === value} className={color === value ? 'color-is-selected' : ''} style={{ background: value }} onClick={() => { setColor(value); setSkin('classic'); if (playing && engine.mode !== 'teams') { engine.player.skin = 'classic'; engine.player.color = value; } }}>{color === value && <Icon name="check" size={16} />}</button>)}</div></div>{playing && engine.mode === 'teams' && <p className="mode-note">Chế độ đồng đội sử dụng màu chung của đội.</p>}<button className="primary-button" onClick={() => openPopup(null)}>Đẹp rồi, chơi thôi<Icon name="arrow" size={18} /></button></Modal>}

      {popup === 'help' && <Modal title="Nhỏ thôi. Nhưng có võ." subtitle="Một luật đơn giản: lớn hơn thì ăn được nhỏ hơn." icon="help" onClose={() => openPopup(null)}><div className="help-demo"><CellPreview size={88} color="#a18add" skin="classic" /><div className="help-dots"><i /><i /><i /></div><CellPreview size={43} color="#edbb66" skin="classic" /></div><div className="help-rows"><div><Icon name="mouse" /><p><strong>Di chuyển chuột để bơi</strong><span>Ăn hạt màu để lớn lên. Trên điện thoại, kéo ngón tay để di chuyển.</span></p></div><div><kbd>SPACE</kbd><p><strong>Tách để bắt kịp đối thủ</strong><span>Cần 40 khối lượng. Tối đa 16 tế bào, tự hợp lại sau một khoảng thời gian.</span></p></div><div><kbd>W</kbd><p><strong>Phóng một phần khối lượng</strong><span>Cho đồng đội ăn hoặc bắn vào virus. Mỗi lần phóng tiêu hao 12 điểm.</span></p></div><div><span className="virus-help-icon" /><p><strong>Cẩn thận với virus xanh</strong><span>Núp sau virus khi còn nhỏ. Tế bào trên 165 điểm có thể bị nổ thành nhiều mảnh.</span></p></div></div><div className="help-shortcuts"><span><kbd>ESC</kbd>Tạm dừng</span><span><Icon name="mouse" size={15} />Lăn chuột để thu phóng</span><span><kbd>TAB</kbd>Đổi người xem</span></div><button className="primary-button" onClick={() => openPopup(null)}>Hiểu rồi<Icon name="check" size={18} /></button></Modal>}

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
    </main>
  );
}

function IconButton({ icon, title, onClick }: { icon: IconName; title: string; onClick: () => void }) {
  return <button className="icon-button" title={title} aria-label={title} onClick={onClick}><Icon name={icon} size={19} /></button>;
}

function DebugOverlay({ fps, diagnostics, violations, aiLine }: {
  fps: number;
  diagnostics: { time: number; cells: number; food: number; ejected: number; viruses: number; particles: number; floaters: number; zoom: number };
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