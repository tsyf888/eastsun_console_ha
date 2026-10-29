import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { Eye, Maximize, Minimize, Pencil, PersonStanding, Snowflake, Sun, Power, RotateCcw, Settings, Star } from 'lucide-react';
import { AdaptiveGrid, SingleRowGrid } from './components/AdaptiveGrid';
import { ActiveDevicesDialog } from './components/ActiveDevicesDialog';
import type { ActiveListRequest } from './components/ActiveDevicesDialog';
import { BatteryDialog } from './components/BatteryDialog';
import { ClimateDialog } from './components/ClimateDialog';
import { ConnectionBadge } from './components/ConnectionBadge';
import { DeviceCard, EmptyRoomCard } from './components/DeviceCards';
import type { TilePlacement } from './components/DeviceCards';
import { CameraBoard } from './components/CameraBoard';
import { HomeStatusSummary } from './components/HomeStatusSummary';
import { LoginPage, SetupPage } from './components/AuthPages';
import { MusicPage } from './components/MusicPage';
import { RoomOrderDialog } from './components/RoomOrderDialog';
import { RoomScene } from './components/RoomScene';
import { RoomStatusSummary } from './components/RoomStatusSummary';
import { TimersDialog } from './components/TimersDialog';
import type { TimerItem } from './components/TimersDialog';
import { SceneBoard } from './components/SceneBoard';
import { SettingsPage } from './components/SettingsPage';
import { SideNav, categoryOf, CATEGORY_META, type CategoryKind } from './components/SideNav';
import { WeatherCompact, WeatherDialog, WeatherHero } from './components/Weather';
import { getMe, logout, putLayout } from './consoleApi';
import { allowedSizesForDevice, favoriteIds, favoriteSizeKey, fromServerLayout, layoutKey, orderedDevices, orderedRooms, readLayout, saveLayout, tileSizeForDevice, toServerLayout, toggleFavorite } from './layout';
import { getRoomDevices, isClimate, isLit, isRunning, sortRunning } from './selectors';
import { sceneDisplayName, sceneTargetService } from './haAdapter';
import { formatDateParts, formatTime, homeGreeting, useNow } from './time';
import { isIngress, kioskOn, restoreKiosk, setKiosk } from './kiosk';
import type { Device, DeviceActions, LayoutState, Room, TileSize } from './types';
import { useConsole } from './useConsole';
import { useHome } from './useHome';
import { useTileDrag } from './useTileDrag';
import { useWeather } from './useWeather';
import { useAlmanac } from './useAlmanac';
import { AlmanacDialog } from './components/AlmanacDialog';
import { weatherIcon } from './weather';
import { applyAccent, applyStyle, applyTheme, resolveTheme } from './theme';

type Page = 'home' | 'room' | 'settings' | 'music' | 'category';

/** 拖动与键盘排序的作用域：常用设备，或某个房间 id。 */
const favoritesScope = 'favorites';

function presentDevices(devices: Device[], ids: string[]): Device[] {
  // hidden 子设备不在常用 / 正在运行等任何页面显示，只出现在宿主设置弹窗里。
  return ids.map((id) => devices.find((device) => device.id === id)).filter((device): device is Device => Boolean(device) && device!.hidden !== true);
}

/** 区域有人 / 无人徽标：仅在该区域配置了传感器时显示。 */
function OccupancyBadge({ occupied }: { occupied: boolean }) {
  return (
    <span className={`occupancy-badge occupancy-badge--${occupied ? 'on' : 'off'}`} title={occupied ? '传感器显示当前有人' : '传感器显示当前无人'}>
      <PersonStanding size={13} />{occupied ? '有人' : '无人'}
    </span>
  );
}

function App() {
  // 账户系统：未登录显示登录页，已登录显示主界面；firstRun=true 时管理员需到设置改账号密码。
  // HA 侧边栏 Ingress 访客（me.ingress=true 且无会话）免登录进入主界面，但只能查看状态（visitor=true）。
  const [auth, setAuth] = useState<{ loading: boolean; authenticated: boolean; ingress: boolean; visitor: boolean; user?: { username: string; isAdmin: boolean; auto?: boolean }; firstRun: boolean }>(
    { loading: true, authenticated: false, ingress: false, visitor: false, firstRun: false },
  );
  // 首跑管理员登录后直接进入「管理员修改」；用户取消后才进入主界面，仍可从 设置→安全 再次调起。
  const [setupDismissed, setSetupDismissed] = useState(false);
  useEffect(() => {
    let active = true;
    getMe()
      .then((me) => {
        if (!active) return;
        if (!me.authenticated && me.ingress) {
          // 侧边栏访客：HA 已做过登录认证，直接进入主界面（非管理员）。
          setAuth({ loading: false, authenticated: true, ingress: true, visitor: true, user: { username: '侧边栏访客', isAdmin: false }, firstRun: false });
          return;
        }
        setAuth({ loading: false, authenticated: me.authenticated, ingress: Boolean(me.ingress), visitor: false, user: me.user, firstRun: Boolean(me.firstRun) });
      })
      .catch(() => { if (active) setAuth({ loading: false, authenticated: false, ingress: false, visitor: false, firstRun: false }); });
    return () => { active = false; };
  }, []);
  function refreshAuth() {
    getMe().then((me) => {
      if (!me.authenticated && me.ingress) {
        setAuth({ loading: false, authenticated: true, ingress: true, visitor: true, user: { username: '侧边栏访客', isAdmin: false }, firstRun: false });
        return;
      }
      setAuth({ loading: false, authenticated: me.authenticated, ingress: Boolean(me.ingress), visitor: false, user: me.user, firstRun: Boolean(me.firstRun) });
    }).catch(() => undefined);
  }
  /** 退出登录：先调后端清除会话与 Cookie，再刷新本地鉴权状态（Ingress 下回到访客态，否则回登录页）。 */
  function handleLogout() {
    logout().finally(refreshAuth);
  }
  if (auth.loading) return <div className="auth-screen"><p className="settings-message">正在加载…</p></div>;
  if (!auth.authenticated) return <LoginPage onAuthenticated={refreshAuth} />;
  if (auth.user?.isAdmin && auth.firstRun && !setupDismissed) {
    return <SetupPage currentUsername={auth.user.username} onCompleted={refreshAuth} onCancel={() => setSetupDismissed(true)} />;
  }
  return <Console authenticated={auth} onLogout={handleLogout} onAuthenticated={refreshAuth} onOpenSetup={() => setSetupDismissed(false)} />;
}

interface ConsoleProps {
  authenticated: { loading: boolean; authenticated: boolean; ingress: boolean; visitor: boolean; user?: { username: string; isAdmin: boolean; auto?: boolean }; firstRun: boolean };
  onLogout: () => void;
  onAuthenticated: () => void;
  onOpenSetup: () => void;
}

/** 主控制台：已登录后显示。 */
function Console({ authenticated, onLogout, onAuthenticated, onOpenSetup }: ConsoleProps) {
  const server = useConsole();
  const live = server.status?.dataSource === 'live';
  const { home: sourceHome, runningIds, actions: deviceActions, refreshRunning, reset, notice, clearNotice } = useHome(
    live ? { entityStates: server.entityStates, catalogue: server.catalogue, custom: server.custom, callService: server.callService, timers: server.timers } : null,
  );
  const [page, setPage] = useState<Page>('home');
  const [selectedRoomId, setSelectedRoomId] = useState('living');
  const [selectedCategoryKind, setSelectedCategoryKind] = useState<CategoryKind>('light');
  const [selectedClimateId, setSelectedClimateId] = useState<string | null>(null);
  const [editingLayout, setEditingLayout] = useState(false);
  const [layout, setLayout] = useState<LayoutState>(readLayout);
  const [roomOrderOpen, setRoomOrderOpen] = useState(false);
  // 房间按共用布局排序；导航、默认房间和“正在运行”的同类排序都使用这个顺序。
  const home = useMemo(() => ({ ...sourceHome, rooms: orderedRooms(sourceHome.rooms, layout.rooms) }), [sourceHome, layout.rooms]);
  // 身份提示：未登录只能查看状态；子账号可以控制但没有管理员权限（进入或切换账户时提示一次）。
  const [appNotice, setAppNotice] = useState<string | null>(null);
  const identity = authenticated.visitor ? 'visitor' : authenticated.user?.isAdmin ? 'admin' : 'member';
  // 登录 / 退出后必须重建 WebSocket：握手时携带的 Cookie 不会更新，旧连接会一直按建连时的身份鉴权，
  // 只改前端状态是不够的，会出现“登录后要刷新页面才能控制”。
  const identityRef = useRef(identity);
  useEffect(() => {
    if (identityRef.current === identity) return;
    identityRef.current = identity;
    server.reconnect();
  }, [identity]);
  useEffect(() => {
    if (identity === 'visitor') setAppNotice('未登录，仅可查看状态，登录后才能控制设备');
    else if (identity === 'member') setAppNotice('该账户不是管理员账户，仅可控制与查看');
  }, [identity]);
  // 最近一次与后端一致的布局；为 null 表示还没收到后端布局，此前不上传本地缓存，避免旧缓存覆盖共用布局。
  const syncedLayoutRef = useRef<string | null>(null);
  const drag = useTileDrag(reorder);
  const now = useNow();
  const weather = useWeather(server.status?.weatherPlace ?? null);
  const { almanac } = useAlmanac();
  const [weatherOpen, setWeatherOpen] = useState(false);
  const [almanacOpen, setAlmanacOpen] = useState(false);
  const [activeList, setActiveList] = useState<ActiveListRequest | null>(null);
  const [batteryOpen, setBatteryOpen] = useState(false);
  // 首页「正在计时」药丸与列表：home 数据里带 timerEndsAt 的设备（服务端寄存器下发）。
  const [timersOpen, setTimersOpen] = useState(false);
  const timerItems = useMemo<TimerItem[]>(() => home.devices.filter((device) => device.timerEndsAt).map((device) => ({
    id: device.id,
    name: device.name,
    roomName: home.rooms.find((room) => room.id === device.roomId)?.name ?? '',
    endsAt: device.timerEndsAt as number,
  })), [home]);
  // “正在运行”的全部关闭需要二次确认：第一次点击进入确认状态，3 秒内再点才执行。
  const [confirmAllOff, setConfirmAllOff] = useState(false);
  useEffect(() => {
    if (!confirmAllOff) return;
    const timer = window.setTimeout(() => setConfirmAllOff(false), 3000);
    return () => window.clearTimeout(timer);
  }, [confirmAllOff]);
  /** 页面切换方向：1 从下方进入（导航中往下），-1 从上方进入，0 淡入。 */
  const [enterDirection, setEnterDirection] = useState<-1 | 0 | 1>(0);
  // 主题：服务端设置的模式 + 本屏的日出日落（自动模式），每 15 秒随时钟重新计算，变化时才应用。
  const themeMode = server.status?.theme;
  const theme = themeMode ? resolveTheme(themeMode, now, weather.forecast) : null;
  useEffect(() => { if (theme) applyTheme(theme); }, [theme]);
  const accent = server.status?.accent;
  useEffect(() => { if (accent) applyAccent(accent); }, [accent]);
  const style = server.status?.style;
  useEffect(() => { if (style) applyStyle(style); }, [style]);

  // 主页时间 / 天气卡片缩放：每块屏幕各自保存在本机（localStorage），设置 → 自定义 → 主页显示里调整。
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--time-scale', localStorage.getItem('eastsun.scale.time') ?? '1');
    root.style.setProperty('--weather-scale', localStorage.getItem('eastsun.scale.weather') ?? '1');
  }, []);

  // 主页版面（本机保存）：classic 经典上下排布；duo 摄像头与常用设备同排（4:6），常用单排自动缩放。
  const [homeDuo, setHomeDuo] = useState(() => localStorage.getItem('eastsun.homeLayout') === 'duo');
  useEffect(() => {
    const sync = () => setHomeDuo(localStorage.getItem('eastsun.homeLayout') === 'duo');
    window.addEventListener('eastsun-home-layout', sync);
    return () => window.removeEventListener('eastsun-home-layout', sync);
  }, []);

  // HAOS Ingress 沉浸模式：隐藏 HA 自身的侧边栏与顶栏；页面加载时恢复上次状态。
  const [kiosk, setKioskState] = useState(kioskOn());
  useEffect(() => { restoreKiosk(); }, []);
  function toggleKiosk() {
    const next = !kiosk;
    setKiosk(next);
    setKioskState(next);
  }

  // 紧凑桌面分辨率（如 1000×595）：页头操作组移到时间与药丸之间，避免被天气卡遮挡。
  const compactQuery = '(min-width: 900px) and (max-width: 1100px) and (min-height: 520px) and (max-height: 680px)';
  const [compactHome, setCompactHome] = useState(() => typeof window !== 'undefined' && window.matchMedia(compactQuery).matches);
  useEffect(() => {
    const mq = window.matchMedia(compactQuery);
    const handler = (e: MediaQueryListEvent) => setCompactHome(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // 紧凑排版开关（本机保存）：任意分辨率强制启用紧凑桌面排版（设置 → 自定义 → 主页显示）。
  const [compactForced, setCompactForced] = useState(() => localStorage.getItem('eastsun.compactLayout') === '1');
  useEffect(() => {
    const sync = () => setCompactForced(localStorage.getItem('eastsun.compactLayout') === '1');
    window.addEventListener('eastsun-compact-layout', sync);
    return () => window.removeEventListener('eastsun-compact-layout', sync);
  }, []);
  const compactActive = compactHome || compactForced;

  // HomeKit 卡片比例（本机保存）：灯/开关/风扇小卡变约 2.4:1 宽扁、大卡同宽两倍高，长按弹设置。
  const [homekitTiles, setHomekitTiles] = useState(() => localStorage.getItem('eastsun.homekitTiles') === '1');
  useEffect(() => {
    const sync = () => setHomekitTiles(localStorage.getItem('eastsun.homekitTiles') === '1');
    window.addEventListener('eastsun-homekit-tiles', sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener('eastsun-homekit-tiles', sync); window.removeEventListener('storage', sync); };
  }, []);

  // 后端推来的共用布局（首次连接或其他屏幕修改后）直接采用。
  useEffect(() => {
    if (!server.layout) return;
    const next = fromServerLayout(server.layout);
    syncedLayoutRef.current = layoutKey(next);
    setLayout(next);
  }, [server.layout]);

  // 本地修改：先写缓存，再合并 400ms 后保存到后端；与后端一致时不重复上传。
  useEffect(() => {
    saveLayout(layout);
    if (!server.connected || syncedLayoutRef.current === null || layoutKey(layout) === syncedLayoutRef.current) return;
    const timer = window.setTimeout(() => {
      putLayout(toServerLayout(layout))
        .then((saved) => { syncedLayoutRef.current = layoutKey(fromServerLayout(saved)); })
        .catch((error: Error) => setAppNotice(`布局未保存：${error.message}`));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [layout, server.connected]);

  const toast = notice ?? appNotice;
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => { clearNotice(); setAppNotice(null); }, 6000);
    return () => window.clearTimeout(timer);
  }, [toast, clearNotice]);

  const settingsExpired = useCallback((message: string) => {
    setAppNotice(message);
    setPage('home');
  }, []);

  // 只读模式下设备按钮仍可点，但操作被替换为提示 + 空操作；编辑布局入口一并隐藏。后端同样会拒绝控制与布局修改。
  // 未登录（含 HA 侧边栏访客）只读：仅可查看状态，所有控制入口都替换为空操作；后端同样会拒绝。
  const canControl = (server.status?.controlEnabled ?? true) && !authenticated.visitor;

  /** 只读模式下的设备操作：每次被调用都弹一次"只读模式"提示，避免用户点一圈啥反应都没有。
   *  1.5s 内只弹一次，防止按住按钮时疯狂刷屏。 */
  const readonlyNoticeRef = useRef(0);
  const makeBlocked = useCallback(() => () => {
    const now = Date.now();
    if (now - readonlyNoticeRef.current > 1500) {
      readonlyNoticeRef.current = now;
      setAppNotice('只读模式，设备操作不会执行');
    }
  }, []);
  const readonlyActions: DeviceActions = useMemo(() => {
    const fn = makeBlocked();
    return {
      toggle: fn, turnOff: fn, adjust: fn, changeLight: fn,
      changeClimateMode: fn, changeFanMode: fn, setSwingMode: fn,
      mediaPower: fn, mediaPlayPause: fn, mediaVolume: fn,
      changeFanSpeed: fn, changeFanPreset: fn, setFanOscillate: fn,
      coverOpen: fn, coverClose: fn, coverStop: fn, coverPosition: fn,
      vacuumStart: fn, vacuumPause: fn, vacuumReturn: fn,
      vacuumLocate: fn, vacuumFanSpeed: fn, setTimer: fn, clearTimer: fn,
    };
  }, [makeBlocked]);
  const baseActions = canControl ? deviceActions : readonlyActions;
  // 情景模式按钮（设置 → 房间中自定义）：点击触发目标一键执行实体（scene/script 用 turn_on，button/input_button 用 press，automation 用 trigger）；执行期间按钮转圈。
  const [pendingSceneId, setPendingSceneId] = useState<string | null>(null);
  const runScene = (scene: { id: string; name: string; entity: string }) => {
    if (!canControl) { setAppNotice('只读模式，情景模式不会执行'); return; }
    setPendingSceneId(scene.id);
    const label = sceneDisplayName(scene, server.catalogue?.entities ?? []);
    server.callService(scene.entity, sceneTargetService(scene.entity), {})
      .catch((error: Error) => setAppNotice(`“${label}”执行失败：${error.message}`))
      .finally(() => setPendingSceneId((current) => (current === scene.id ? null : current)));
  };
  // 季节规则（设置 → 自动化）：夏季不打开地暖；打开空调时直接用当季的模式，免得先开成相反模式再被 HA 自动化改回来。
  const season = server.status?.season ?? null;
  const actions: DeviceActions = canControl && season ? {
    ...baseActions,
    toggle: (id) => {
      const device = home.devices.find((item) => item.id === id);
      if (device && isClimate(device) && device.available && !device.on) {
        if (device.kind === 'heating' && season === 'summer') {
          setAppNotice(`${device.name}：夏季不能打开制热，可在 设置 → 自动化 切换季节`);
          return;
        }
        const wrong = season === 'summer' ? 'heat' : 'cool';
        const right = season === 'summer' ? 'cool' : 'heat';
        if (device.kind === 'climate' && device.mode === wrong && device.hvacModes.includes(right)) {
          baseActions.changeClimateMode(id, right);
          return;
        }
      }
      baseActions.toggle(id);
    },
    changeClimateMode: (id, mode) => {
      const device = home.devices.find((item) => item.id === id);
      if (device?.kind === 'heating' && season === 'summer' && mode !== 'off') {
        setAppNotice(`${device.name}：夏季不能打开制热，可在 设置 → 自动化 切换季节`);
        return;
      }
      baseActions.changeClimateMode(id, mode);
    },
  } : baseActions;

  // HA 模式下房间来自手动房间配置，配置加载前可能一个房间都没有。
  const selectedRoom: Room = home.rooms.find((room) => room.id === selectedRoomId) ?? home.rooms[0] ?? { id: '', name: '房间', category: 'main' };
  // 情景模式：首页板块只取指向“我的家庭”的按钮，房间板块只取指向当前房间的按钮；没有按钮时板块隐藏。
  const allScenes = server.custom?.scenes ?? [];
  const homeScenes = allScenes.filter((scene) => scene.scope === 'home');
  const roomScenes = allScenes.filter((scene) => scene.scope === selectedRoom.id);
  // 自定义 RTSP 摄像头：与情景按钮同样按作用域分首页 / 房间，显示在情景板块上一行。
  const allCameras = server.custom?.cameras ?? [];
  const homeCameras = allCameras.filter((camera) => camera.scope === 'home');
  const roomCameras = allCameras.filter((camera) => camera.scope === selectedRoom.id);
  // 房间页设备：首次进入（没有保存过顺序时）按名称自然排序，与类别详情页一致；拖动后以后端保存的顺序为准。
  const selectedRoomDevices = useMemo(() => {
    const roomDevices = getRoomDevices(home, selectedRoom.id);
    const savedOrder = layout.order[selectedRoom.id];
    return savedOrder
      ? orderedDevices(roomDevices, savedOrder)
      : [...roomDevices].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' }));
  }, [home, selectedRoom.id, layout.order]);
  const selectedRoomLitCount = selectedRoomDevices.filter(isLit).length;
  // 区域有人传感器状态（后端按“或”计算后下发）；只给配置过传感器的区域显示徽标。
  const occupancy = server.status?.occupancy;
  const occupancyScope = page === 'room' ? selectedRoom.id : page === 'home' ? 'home' : null;
  const occupancyKnown = Boolean(occupancy && occupancyScope && occupancyScope in occupancy);
  const selectedClimate = home.devices.filter(isClimate).find((device) => device.id === selectedClimateId);
  const roomOf = (device: Device): Room => home.rooms.find((room) => room.id === device.roomId) ?? selectedRoom;
  const favorites = favoriteIds(layout);
  const favoriteDevices = presentDevices(home.devices, favorites);
  const runningDevices = sortRunning(home, presentDevices(home.devices, runningIds));
  const runningNow = runningDevices.filter(isRunning).length;
  // 常用卡片本身显示开关状态，“正在运行”只列常用里没有的设备，避免同一设备出现两次；标题仍计全屋运行总数。
  const runningOthers = runningDevices.filter((device) => !favorites.includes(device.id));
  const runningInFavorites = runningDevices.filter((device) => isRunning(device) && favorites.includes(device.id)).length;
  // “一键关闭”按设置里选的类别与区域过滤；默认只关灯，可选空调/地暖、风扇、窗帘等；额外实体 ID 也纳入。
  // 目标集合取全屋所有运行中设备（含常用设备——常用只是展示位置，不应影响能否被一键关闭），
  // 再剔除设置里勾选的排除实体。
  const allOffKinds = server.status?.allOffKinds ?? ['light'];
  const allOffScopes = server.status?.allOffScopes ?? [];
  const allOffEntities = server.status?.allOffEntities ?? [];
  const allOffExcludes = server.status?.allOffExcludes ?? [];
  const allOffTargets = runningDevices.filter((device) =>
    (allOffKinds.includes(device.kind) || (device.kind === 'heating' && allOffKinds.includes('climate'))
      || allOffEntities.includes(device.id)) &&
    !allOffExcludes.includes(device.id) &&
    device.available && isRunning(device) &&
    (allOffScopes.length === 0 || allOffScopes.includes(device.roomId)),
  );
  const homeTitle = server.status?.homeTitle || '我的家庭';
  // 音乐页内嵌地址（设置 → 音乐）；未配置时侧栏不显示入口。
  const musicUrl = (server.status?.musicUrl ?? '').trim();
  const tileScale = (server.status?.tileScale ?? 100) / 100;
  const brandTitle = server.status?.brandTitle ?? '家庭控制';
  // 农历副标题：后端内置历法计算（中国时区），点击打开黄历详情；未加载好时不显示。
  const homeSubline = almanac?.text ?? '';
  // 同步网页标题为家庭名称
  useEffect(() => { document.title = brandTitle; }, [brandTitle]);
  // 我的家庭页大标题就是当前时间：19:49 9月28日 周一（侧栏导航仍用首页名称）。
  // 时间/日期/星期三个片段各自不可拆行，换行只能发生在片段之间。
  const homeClockParts = formatDateParts(now);
  // 全屋页页头按当前天气着色，其他页面保持中性。
  const heroTone = page === 'home' && weather.forecast ? weatherIcon(weather.forecast.now.icon).tone : null;

  function reorder(scope: string, order: string[]) {
    setLayout((previous) => scope === favoritesScope ? { ...previous, favorites: order } : { ...previous, order: { ...previous.order, [scope]: order } });
  }

  function changeRoomOrder(ids: string[]) {
    setLayout((previous) => ({ ...previous, rooms: ids }));
  }

  function leaveLayoutEditing() {
    setEditingLayout(false);
    drag.cancel();
  }

  /** 按导航顺序判断切换方向：往导航下方走，新页面从下方进入。 */
  function directionTo(key: string): -1 | 0 | 1 {
    const target = navTargets.findIndex((item) => item.key === key);
    if (currentNavIndex < 0 || target < 0) return 0;
    return Math.sign(target - currentNavIndex) as -1 | 0 | 1;
  }

  function openRoom(id: string) {
    setEnterDirection(directionTo(id));
    setSelectedRoomId(id);
    leaveLayoutEditing();
    setPage('room');
  }

  function openHome() {
    setEnterDirection(directionTo('home'));
    refreshRunning();
    leaveLayoutEditing();
    setPage('home');
  }

  /** 齿轮进入设置：账户系统下任何已登录用户都可进入，权限由 SettingsPage 内按角色控制。 */
  function requestSettings() {
    if (page !== 'settings') openSettings();
  }

  function openSettings() {
    setEnterDirection(0);
    leaveLayoutEditing();
    setSelectedClimateId(null);
    setPage('settings');
  }

  /** 音乐页（侧栏入口，仅在设置里配置了内嵌地址时出现）。 */
  function openMusic() {
    if (!musicUrl) return;
    setEnterDirection(0);
    leaveLayoutEditing();
    setPage('music');
  }

  /** 设备类别页：按设备类型查看所有房间的同类设备，卡片右上角显示房间名。 */
  function openCategory(kind: CategoryKind) {
    setEnterDirection(0);
    leaveLayoutEditing();
    setSelectedClimateId(null);
    setSelectedCategoryKind(kind);
    setPage('category');
  }

  function changeSize(id: string, size: TileSize) {
    setLayout((previous) => ({ ...previous, sizes: { ...previous.sizes, [id]: size } }));
  }

  function changeFavorite(id: string) {
    setLayout((previous) => toggleFavorite(previous, id));
  }

  /** 当前页可排序的设备：全屋页为常用设备，房间页为该房间设备，类别页为该类别所有设备。 */
  function sortable(): { scope: string; ids: string[] } {
    if (page === 'home') return { scope: favoritesScope, ids: favoriteDevices.map((device) => device.id) };
    if (page === 'category') {
      const filtered = home.devices.filter((device) => categoryOf(device) === selectedCategoryKind);
      const ordered = orderedDevices(filtered, layout.order[`category/${selectedCategoryKind}`]);
      if (!layout.order[`category/${selectedCategoryKind}`]) ordered.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' }));
      return { scope: `category/${selectedCategoryKind}`, ids: ordered.map((device) => device.id) };
    }
    return { scope: selectedRoom.id, ids: selectedRoomDevices.map((device) => device.id) };
  }

  function moveDevice(id: string, direction: -1 | 1) {
    const { scope, ids } = sortable();
    const index = ids.indexOf(id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= ids.length) return;
    [ids[index], ids[next]] = [ids[next], ids[index]];
    reorder(scope, ids);
  }

  function startDrag(id: string, event: PointerEvent<HTMLElement>) {
    if (!editingLayout) return;
    const { scope, ids } = sortable();
    drag.start(id, scope, ids, event);
  }

  /** 编辑布局时共用的排序属性。 */
  function editingTile(device: Device, index: number, total: number): Omit<TilePlacement, 'size'> {
    return {
      editing: editingLayout,
      index,
      total,
      onMove: moveDevice,
      onDragStart: startDrag,
      onFavoriteToggle: changeFavorite,
      favorite: favorites.includes(device.id),
      dragging: drag.view?.id === device.id,
      dropTarget: drag.view?.overId === device.id,
      dragOffset: drag.view?.id === device.id ? drag.view : undefined,
    };
  }

  function resetDemo() {
    reset();
    setSelectedClimateId(null);
  }

  // 子设备绑定：宿主设备 id → 子设备列表（hidden），供灯 / 窗帘设置弹窗渲染大卡片。
  const childDevicesByHost = useMemo(() => {
    const map = new Map<string, Device[]>();
    for (const [hostId, childIds] of Object.entries(server.custom?.children ?? {})) {
      const list = childIds
        .map((id) => home.devices.find((device) => device.id === id))
        .filter((device): device is Device => Boolean(device));
      if (list.length > 0) map.set(hostId, list);
    }
    return map;
  }, [home.devices, server.custom]);

  function card(device: Device, room: Room, tile: TilePlacement) {
    return <DeviceCard key={device.id} device={device} room={room} tile={tile} actions={actions} onOpenClimate={setSelectedClimateId} seasonLock={season === 'summer' && device.kind === 'heating' ? '夏季停用' : undefined} childDevices={childDevicesByHost.get(device.id)} />;
  }

  /** 常用区卡片可在“编辑”里切换 1×1／2×1，尺寸单独保存，不影响房间里的同一设备。 */
  function favoriteCard(device: Device, index: number) {
    return card(device, roomOf(device), {
      size: tileSizeForDevice(device, layout.sizes[favoriteSizeKey(device.id)]),
      onSizeChange: (id, size) => changeSize(favoriteSizeKey(id), size),
      ...editingTile(device, index, favoriteDevices.length),
    });
  }

  // 同排版面：常用卡片强制单排，需要每张卡的列跨度（1×1 为 1、2×1 为 2）来计算整体缩放。
  const favoriteSpans = favoriteDevices.map((device) => tileSizeForDevice(device, layout.sizes[favoriteSizeKey(device.id)]) === '2x1' ? 2 : 1);
  const duoActive = homeDuo && favoriteDevices.length > 0;

  // HomeKit 比例只作用于灯 / 开关 / 风扇 / 窗帘四类卡片，其余卡片保持原样（在 HK 网格里占两行补齐）。
  const hkTilesFor = (device: Device) => homekitTiles && (device.kind === 'light' || device.kind === 'switch' || device.kind === 'fan' || device.kind === 'cover');

  /** “正在运行”用于查看和顺手关掉，统一用单格；只能双格的（播放器）保持默认。 */
  function runningCard(device: Device) {
    return card(device, roomOf(device), { size: allowedSizesForDevice(device).includes('1x1') ? '1x1' : tileSizeForDevice(device), hkTiles: hkTilesFor(device) });
  }

  function turnOffRunning() {
    if (!confirmAllOff) {
      setConfirmAllOff(true);
      return;
    }
    setConfirmAllOff(false);
    allOffTargets.forEach((device) => actions.turnOff(device.id));
  }

  function roomCard(device: Device, index: number) {
    return card(device, selectedRoom, {
      size: tileSizeForDevice(device, layout.sizes[device.id]),
      onSizeChange: changeSize,
      ...editingTile(device, index, selectedRoomDevices.length),
      hkTiles: hkTilesFor(device),
    });
  }

  // 右侧内容区页面切换动画的方向基准：顺序与导航一致（首页、房间、其他空间）。
  const navTargets = [
    { key: 'home', label: homeTitle },
    ...[...home.rooms.filter((room) => room.category === 'main'), ...home.rooms.filter((room) => room.category === 'other')].map((room) => ({ key: room.id, label: room.name })),
  ];
  const currentNavIndex = page === 'home' ? 0 : page === 'room' ? navTargets.findIndex((target) => target.key === selectedRoom.id) : -1;

  // 页面切换动画：页头文字与内容按方向进入。
  const pageKey = page === 'room' ? `room-${selectedRoom.id}` : page === 'category' ? `category-${selectedCategoryKind}` : page;
  const enterClass = `page-enter page-enter--${enterDirection === 1 ? 'up' : enterDirection === -1 ? 'down' : 'fade'}`;

  const editButton = (
    <button type="button" className={`small-button${editingLayout ? ' small-button--selected' : ''}`} onClick={() => editingLayout ? leaveLayoutEditing() : setEditingLayout(true)}>
      <Pencil size={15} />{editingLayout ? '完成' : page === 'home' ? '编辑' : '编辑布局'}
    </button>
  );

  /** 页头右侧操作组：紧凑桌面分辨率下移到时间与药丸之间，避免被天气卡遮挡。 */
  const heroActions = (
    <div className="hero__actions">
      {!canControl && <span className="demo-flag demo-flag--readonly"><Eye size={14} />只读模式</span>}
      <ConnectionBadge quiet={page !== 'home'} connected={server.connected} status={server.status} staleSince={server.staleSince} offlineSince={server.offlineSince} now={now} />
      {!live && <button type="button" className="text-button" onClick={resetDemo} aria-label="重置演示设备状态"><RotateCcw size={15} />重置演示</button>}
      {isIngress && <button type="button" className="icon-button" onClick={toggleKiosk} aria-pressed={kiosk} aria-label={kiosk ? '退出沉浸模式' : '沉浸模式'} title={kiosk ? '退出沉浸模式（显示侧边栏与顶栏）' : '沉浸模式（隐藏侧边栏与顶栏）'}>{kiosk ? <Minimize size={18} /> : <Maximize size={18} />}</button>}
      <button type="button" className="icon-button hero__settings" onClick={requestSettings} aria-current={page === 'settings' ? 'page' : undefined} aria-label="设置" title="设置"><Settings size={18} /></button>
    </div>
  );

  return (
    <div className={compactActive ? 'app-shell app-shell--compact' : 'app-shell'}>
      <SideNav home={home} homeTitle={homeTitle} current={page === 'room' ? { roomId: selectedRoom.id } : page === 'category' ? { category: selectedCategoryKind } : page} now={now} onHome={openHome} onOpenRoom={openRoom} onOpenCategory={openCategory} onSettings={requestSettings} onEditRooms={canControl ? () => setRoomOrderOpen(true) : undefined} onOpenMusic={musicUrl ? openMusic : undefined} people={server.status?.people} occupancy={occupancy} brandTitle={server.status?.brandTitle} />
      <header className={`hero${page === 'home' ? ' hero--home' : ''}${page === 'settings' ? ' hero--settings' : ''}${heroTone ? ` hero--weather weather--${heroTone}` : ''}`}>
        {page === 'room' && <RoomScene key={selectedRoom.id} room={selectedRoom} lit={selectedRoomLitCount > 0} />}
        <div className="hero__top">
          <span className="hero__brand">{homeGreeting(now)}</span>
          {(!compactActive || page !== 'home') && heroActions}
          {/* 天气常驻页头操作行行尾：桌面端 CSS 隐藏（用右侧大天气卡），手机分辨率显示在设置按钮右边 */}
          {page === 'home' && <WeatherCompact weather={weather} onOpen={() => setWeatherOpen(true)} />}
        </div>
        {/* 手机端农历行：标题区在手机上整体隐藏，这里单独补一行可点的农历，点开黄历详情 */}
        {page === 'home' && homeSubline && (
          <p className="hero__almanac"><button type="button" className="hero__subline-button" onClick={() => setAlmanacOpen(true)} title="点击查看农历详情">{homeSubline}</button></p>
        )}
        <div className={`hero__body ${enterClass}`} key={pageKey}>
          <div className="hero__main">
            <div className="hero__title">
              <div>
                <h1>{page === 'room' ? selectedRoom.name : page === 'category' ? CATEGORY_META[selectedCategoryKind].label : page === 'settings' ? '设置' : page === 'music' ? '音乐' : <span className="datetime"><span className="datetime__time">{formatTime(now)}</span> <span className="datetime__part">{homeClockParts.monthDay}</span> <span className="datetime__part">{homeClockParts.weekday}</span></span>}{page === 'home' && season && <span className={`season-badge season-badge--${season}`} title="季节规则（设置 → 自动化）">{season === 'summer' ? <Sun size={14} /> : <Snowflake size={14} />}{season === 'summer' ? '夏季' : '冬季'}</span>}{occupancyKnown && occupancyScope && <OccupancyBadge occupied={occupancy?.[occupancyScope] === true} />}</h1>
                {page === 'home'
                  ? (homeSubline
                    ? <p><button type="button" className="hero__subline-button" onClick={() => setAlmanacOpen(true)} title="点击查看农历详情">{homeSubline}</button></p>
                    : null)
                  : <p>{page === 'room' ? '房间状态与设备控制' : page === 'category' ? '按类别查看所有房间的同类设备' : page === 'settings' ? '管理密码、Home Assistant 连接与控制权限' : '内嵌音乐界面'}</p>}
              </div>
            </div>
            {compactActive && page === 'home' ? (
              <div className="hero__pills-row">
                {heroActions}
                <HomeStatusSummary home={home} onOpen={setActiveList} onOpenBattery={() => setBatteryOpen(true)} onOpenTimers={() => setTimersOpen(true)} timersCount={timerItems.length} batteryEnabled={server.custom?.battery?.enabled !== false} />
              </div>
            ) : (
              <>
                {page === 'room' && <RoomStatusSummary home={home} roomId={selectedRoom.id} onOpen={setActiveList} onOpenTimers={() => setTimersOpen(true)} />}
                {page === 'home' && <HomeStatusSummary home={home} onOpen={setActiveList} onOpenBattery={() => setBatteryOpen(true)} onOpenTimers={() => setTimersOpen(true)} timersCount={timerItems.length} batteryEnabled={server.custom?.battery?.enabled !== false} />}
              </>
            )}
          </div>
        </div>
        {page === 'home' && <WeatherHero weather={weather} now={now} onOpen={() => setWeatherOpen(true)} />}
      </header>

      <main className={`main-content ${enterClass}`} key={pageKey}>
        {page === 'home' && (
          <>
            <div className="home-date-card" aria-hidden="true">
              <span className="home-date-card__day">{homeClockParts.monthDay}</span>
              <span className="home-date-card__weekday">{homeClockParts.weekday}</span>
            </div>
            {duoActive ? (
              <>
                <div className={`home-duo-row${homeCameras.length === 0 ? ' home-duo-row--solo' : ''}`}>
                  {homeCameras.length > 0 && <CameraBoard title="摄像头" cameras={homeCameras} scale={tileScale} go2rtcEnabled={server.status?.go2rtc?.enabled ?? false} />}
                  <div className="home-duo-row__favorites">
                    <div className="section-heading">
                      <h2>常用设备 <em>· {favoriteDevices.length} 个</em></h2>
                      <div className="section-heading__actions">
                        <span>{!canControl ? '只读模式，设备操作不会执行' : editingLayout ? '拖动调整顺序，右下角切换尺寸，点 ★ 移出常用' : '在房间“编辑布局”里点 ☆ 加入常用'}</span>
                        {canControl && editButton}
                      </div>
                    </div>
                    <SingleRowGrid className="tile-grid--quick" spans={favoriteSpans}>{favoriteDevices.map(favoriteCard)}</SingleRowGrid>
                  </div>
                </div>
                {homeScenes.length > 0 && <SceneBoard title="常用情景" scenes={homeScenes} entities={server.catalogue?.entities ?? []} pendingId={pendingSceneId} onRun={runScene} style={server.custom?.sceneStyle} />}
              </>
            ) : (
              <>
                {homeCameras.length > 0 && <CameraBoard title="摄像头" cameras={homeCameras} scale={tileScale} go2rtcEnabled={server.status?.go2rtc?.enabled ?? false} />}
                {homeScenes.length > 0 && <SceneBoard title="常用情景" scenes={homeScenes} entities={server.catalogue?.entities ?? []} pendingId={pendingSceneId} onRun={runScene} style={server.custom?.sceneStyle} />}
                <div className="section-heading">
                  <h2>常用设备 <em>· {favoriteDevices.length} 个</em></h2>
                  <div className="section-heading__actions">
                    <span>{!canControl ? '只读模式，设备操作不会执行' : editingLayout ? '拖动调整顺序，右下角切换尺寸，点 ★ 移出常用' : '在房间“编辑布局”里点 ☆ 加入常用'}</span>
                    {canControl && (favoriteDevices.length > 0 || editingLayout) && editButton}
                  </div>
                </div>
                {favoriteDevices.length > 0
                  ? <AdaptiveGrid className="tile-grid tile-grid--quick" scale={tileScale}>{favoriteDevices.map(favoriteCard)}</AdaptiveGrid>
                  : <div className="empty-room"><span className="tile__chip"><Star size={20} /></span><p>还没有常用设备。进入房间点“编辑布局”，给设备点 ☆ 即可加入。</p></div>}
              </>
            )}
            <div className="section-heading section-heading--spaced">
              <h2>正在运行 <em>· {runningNow} 个</em></h2>
              <div className="section-heading__actions">
                {runningInFavorites > 0 && <span>{runningOthers.length > 0 ? `其中 ${runningInFavorites} 个在常用设备中` : `都在上方常用设备中`}</span>}
                {canControl && allOffTargets.length > 0 && (
                  <button type="button" className={`small-button${confirmAllOff ? ' small-button--danger' : ''}`} onClick={turnOffRunning} title="一键关闭正在运行的设备（在设置 → 设备里配置类别与区域）">
                    <Power size={15} />{confirmAllOff ? `确认关闭 ${allOffTargets.length} 个` : '一键关闭'}
                  </button>
                )}
              </div>
            </div>
            {runningOthers.length > 0
              ? <AdaptiveGrid className={`tile-grid tile-grid--running${homekitTiles ? ' adaptive-grid--hk' : ''}`} scale={tileScale}>{runningOthers.map(runningCard)}</AdaptiveGrid>
              : runningNow === 0 && <div className="empty-room"><span className="tile__chip"><Power size={20} /></span><p>目前没有打开的设备。</p></div>}
          </>
        )}
        {page === 'room' && (
          <>
            {roomCameras.length > 0 && <CameraBoard title="摄像头" cameras={roomCameras} scale={tileScale} go2rtcEnabled={server.status?.go2rtc?.enabled ?? false} />}
            {roomScenes.length > 0 && <SceneBoard title="情景模式" scenes={roomScenes} entities={server.catalogue?.entities ?? []} pendingId={pendingSceneId} onRun={runScene} style={server.custom?.sceneStyle} />}
            <div className="section-heading">
              <h2>设备与状态 <em>· {selectedRoomDevices.length} 个</em></h2>
              <div className="section-heading__actions">
                {selectedRoomLitCount > 0 && <span className="section-heading__lit">{selectedRoomLitCount} 盏灯亮</span>}
                {(() => {
                  const counts = new Map<string, number>();
                  for (const d of selectedRoomDevices) {
                    const kind = categoryOf(d);
                    if (!kind) continue;
                    counts.set(kind, (counts.get(kind) ?? 0) + 1);
                  }
                  const stats = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([kind, n]) => `${CATEGORY_META[kind as CategoryKind].label} ${n}`).join(' / ');
                  return stats ? <span className="section-heading__stats">{stats}</span> : null;
                })()}
                {canControl && editButton}
              </div>
            </div>
            {selectedRoomDevices.length > 0
              ? <AdaptiveGrid className={`tile-grid tile-grid--room${homekitTiles ? ' adaptive-grid--hk' : ''}`} scale={tileScale}>{selectedRoomDevices.map(roomCard)}</AdaptiveGrid>
              : <EmptyRoomCard name={selectedRoom.name} />}
          </>
        )}
        {page === 'settings' && <SettingsPage status={server.status} user={authenticated.user} ingress={authenticated.ingress} firstRun={authenticated.firstRun} onLogout={onLogout} onAuthenticated={onAuthenticated} onOpenSetup={onOpenSetup} onExpired={settingsExpired} />}
        {page === 'music' && (musicUrl ? <MusicPage url={musicUrl} /> : <div className="empty-room"><p>还没有配置音乐界面，请到 设置 → 音乐 中填写地址。</p></div>)}
        {page === 'category' && (() => {
          const filtered = home.devices.filter((device) => categoryOf(device) === selectedCategoryKind);
          const Icon = CATEGORY_META[selectedCategoryKind].Icon;
          const savedOrder = layout.order[`category/${selectedCategoryKind}`];
          const ordered = savedOrder
            ? orderedDevices(filtered, savedOrder)
            : [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' }));
          function categoryCard(device: Device, index: number) {
            return card(device, roomOf(device), {
              size: tileSizeForDevice(device, layout.sizes[device.id]),
              onSizeChange: changeSize,
              ...editingTile(device, index, ordered.length),
            });
          }
          return (
            <>
              {ordered.length === 0 ? (
                <div className="empty-room">
                  <Icon size={36} aria-hidden="true" />
                  <p>当前没有「{CATEGORY_META[selectedCategoryKind].label}」类设备</p>
                </div>
              ) : (
                <section className="home-section">
                  <div className="section-heading">
                    <h2><Icon size={18} />{CATEGORY_META[selectedCategoryKind].label} <em>· {ordered.length} 个</em></h2>
                    <div className="section-heading__actions">
                      <span>{!canControl ? '只读模式，设备操作不会执行' : editingLayout ? '拖动调整顺序，右下角切换尺寸' : '默认按名称自然排序，可编辑布局保存'}</span>
                      {canControl && editButton}
                    </div>
                  </div>
                  <AdaptiveGrid className="tile-grid tile-grid--category" scale={tileScale}>
                    {ordered.map((device, index) => categoryCard(device, index))}
                  </AdaptiveGrid>
                </section>
              )}
            </>
          );
        })()}
      </main>

      <RoomOrderDialog open={roomOrderOpen && canControl} rooms={home.rooms} onChange={changeRoomOrder} onClose={() => setRoomOrderOpen(false)} />
      {toast && <div className="toast" role="alert" onClick={() => { clearNotice(); setAppNotice(null); }}>{toast}</div>}
      <ActiveDevicesDialog request={activeList} home={home} actions={actions} canControl={canControl} onClose={() => setActiveList(null)} />
      {batteryOpen && <BatteryDialog batteries={home.batteries} home={home} onClose={() => setBatteryOpen(false)} />}
      {timersOpen && <TimersDialog timers={timerItems} onClose={() => setTimersOpen(false)} onClear={deviceActions.clearTimer} />}
      <WeatherDialog open={weatherOpen} weather={weather} now={now} onClose={() => setWeatherOpen(false)} />
      <AlmanacDialog open={almanacOpen} almanac={almanac} onClose={() => setAlmanacOpen(false)} />
      <ClimateDialog climate={selectedClimate} room={selectedClimate && roomOf(selectedClimate)} actions={actions} onClose={() => setSelectedClimateId(null)} />
    </div>
  );
}

export default App;
