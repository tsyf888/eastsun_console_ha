import { ArrowUpDown, House, Music, Settings, Lightbulb, Power, AirVent, Blinds, Fan, Wind, Radio, Camera, ShieldAlert, Bot, LayoutGrid } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { apiPath } from '../consoleApi';
import type { PersonStatus } from '../consoleClient';
import { roomIcon } from '../appearance';
import { isActiveAlert, isRunning } from '../selectors';
import { formatTime } from '../time';
import type { Device, HomeState } from '../types';

/** 设备类型分组：把 climate + heating 合并为温控，其余按 kind 单独分组；all 为类别页的「全部」入口。 */
export type CategoryKind = 'all' | 'light' | 'switch' | 'climate' | 'fan' | 'cover' | 'media' | 'camera' | 'safety' | 'sensor' | 'vacuum';

/** 把 Device 的原始 kind 映射到导航栏里的类别；不识别的返回 null（如纯 sensor/battery 不进导航）。 */
export function categoryOf(device: Device): CategoryKind | null {
  switch (device.kind) {
    case 'light': return 'light';
    case 'switch': return 'switch';
    case 'climate': case 'heating': return 'climate';
    case 'fan': return 'fan';
    case 'cover': return 'cover';
    case 'media': return 'media';
    case 'safety': return 'safety';
    case 'sensor': return 'sensor';
    case 'vacuum': return 'vacuum';
    default: return null;
  }
}

export const CATEGORY_META: Record<CategoryKind, { label: string; short: string; Icon: typeof Lightbulb }> = {
  all:      { label: '全部',       short: '全', Icon: LayoutGrid },
  light:    { label: '灯',         short: '灯', Icon: Lightbulb },
  switch:   { label: '开关',       short: '开', Icon: Power },
  climate:  { label: '空调',  short: '温', Icon: AirVent },
  fan:      { label: '风扇',       short: '风', Icon: Fan },
  cover:    { label: '窗帘',       short: '帘', Icon: Blinds },
  media:    { label: '影音',       short: '音', Icon: Radio },
  camera:   { label: '摄像头',     short: '像', Icon: Camera },
  safety:   { label: '安防',       short: '防', Icon: ShieldAlert },
  sensor:   { label: '传感器',     short: '感', Icon: Wind },
  vacuum:   { label: '扫地机',     short: '扫', Icon: Bot },
};

/** 具体设备类型的固定顺序（不含「全部」），类别页按此顺序分组展示。 */
export const CATEGORY_KINDS: CategoryKind[] = ['light', 'switch', 'climate', 'fan', 'cover', 'media', 'camera', 'safety', 'sensor', 'vacuum'];

interface SideNavProps {
  home: HomeState;
  /** 首页入口名称，与首页标题一致。 */
  homeTitle: string;
  /** 当前页面：全屋、设置、音乐、某个房间 id 或某个设备类别。 */
  current: 'home' | 'settings' | 'music' | { roomId: string } | { category: CategoryKind };
  now: Date;
  onHome: () => void;
  onOpenRoom: (id: string) => void;
  /** 打开设备类别页；不传则不显示类别分组。 */
  onOpenCategory?: (kind: CategoryKind) => void;
  onSettings: () => void;
  /** 打开房间排序；只读模式下不传，入口隐藏。 */
  onEditRooms?: () => void;
  /** 打开音乐页；未配置音乐地址时不传，入口隐藏。 */
  onOpenMusic?: () => void;
  /** 人员在家状态列表；为空时不显示。 */
  people?: PersonStatus[];
  /** 区域有人状态（scope → 是否有人）：房间 / 首页按钮上显示绿色圆点。 */
  occupancy?: Record<string, boolean>;
  /** 导航栏品牌名称（默认"家庭控制"）。 */
  brandTitle?: string;
}

/** 左侧导航：全屋在前，房间直接展开；手机上变为可横滑的底部标签栏。 */
export function SideNav({ home, homeTitle, current, now, onHome, onOpenRoom, onOpenCategory, onSettings, onEditRooms, onOpenMusic, people, occupancy, brandTitle }: SideNavProps) {
  const navRef = useRef<HTMLElement>(null);
  const currentRoomId = typeof current === 'object' && 'roomId' in current ? current.roomId : null;
  const currentCategory = typeof current === 'object' && 'category' in current ? current.category : null;
  const currentKey = currentRoomId ?? currentCategory ?? (typeof current === 'string' ? current : null);
  const groups = [
    { label: '房间', rooms: home.rooms.filter((room) => room.category === 'main') },
    { label: '其他空间', rooms: home.rooms.filter((room) => room.category === 'other') },
  ].filter((group) => group.rooms.length > 0);
  const categories = useMemo(() => {
    const counts = new Map<CategoryKind, number>();
    const running = new Map<CategoryKind, boolean>();
    const alerts = new Map<CategoryKind, boolean>();
    let anyRunning = false;
    let anyAlert = false;
    for (const device of home.devices) {
      if (device.hidden) continue;
      const kind = categoryOf(device);
      if (!kind) continue;
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
      if (isRunning(device)) {
        running.set(kind, true);
        anyRunning = true;
      }
      if (isActiveAlert(device)) {
        alerts.set(kind, true);
        anyAlert = true;
      }
    }
    const entries = CATEGORY_KINDS
      .map((kind) => ({ kind, count: counts.get(kind) ?? 0, running: running.get(kind) ?? false, alert: alerts.get(kind) ?? false }))
      .filter((entry) => entry.count > 0);
    const total = entries.reduce((sum, entry) => sum + entry.count, 0);
    return total > 0 ? [{ kind: 'all' as CategoryKind, count: total, running: anyRunning, alert: anyAlert }, ...entries] : [];
  }, [home.devices]);

  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [currentKey]);

  return (
    <nav ref={navRef} className="side-nav" aria-label="主导航">
      <div className="side-nav__brand"><span className="brand-mark" aria-hidden="true"><House size={18} /></span><span>{brandTitle ?? '家庭控制'}</span></div>
      <div className="side-nav__items">
        <button type="button" title={occupancy?.home ? `${homeTitle}（有人）` : homeTitle} aria-current={current === 'home' ? 'page' : undefined} onClick={onHome}><House size={20} /><span>{homeTitle}</span>
          {occupancy?.home && <i className="side-nav__dot side-nav__dot--occupied" aria-label="屋内有人" />}
        </button>
        {groups.map((group) => (
          <div key={group.label} className="side-nav__group" role="group" aria-label={group.label}>
            <span className="side-nav__label" aria-hidden="true">{group.label}</span>
            {group.rooms.map((room) => {
              const Icon = roomIcon(room);
              const occupied = occupancy?.[room.id] === true;
              // 圆点与「正在运行」用同一判断：灯/开关/空调/风扇/扫地机/影音，演示与真实数据表现一致。
              const roomDevices = home.devices.filter((device) => device.roomId === room.id && !device.hidden);
              const alert = roomDevices.some(isActiveAlert);
              const running = roomDevices.some(isRunning);
              const tone = occupied ? null : alert ? 'alert' : running ? 'active' : null;
              return (
                <button key={room.id} type="button" title={occupied ? `${room.name}（有人）` : room.name} aria-label={`${room.name}${occupied ? '，有人' : tone === 'alert' ? '，有告警' : tone ? '，有设备运行' : ''}`} aria-current={currentRoomId === room.id ? 'page' : undefined} onClick={() => onOpenRoom(room.id)}>
                  <Icon size={20} /><span>{room.name}</span>
                  {occupied
                    ? <i className="side-nav__dot side-nav__dot--occupied" aria-hidden="true" />
                    : tone && <i className={`side-nav__dot side-nav__dot--${tone === 'alert' ? 'alert' : 'active'}`} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        ))}
        {categories.length > 0 && (
          <div className="side-nav__group" role="group" aria-label="类别">
            <span className="side-nav__label" aria-hidden="true">类别</span>
            {categories.map(({ kind, count, running, alert }) => {
              const { Icon, label } = CATEGORY_META[kind];
              return (
                <button key={kind} type="button" title={`${label}（${count}）`} aria-label={`${label}，共 ${count} 个${alert ? '，有告警' : running ? '，有设备运行' : ''}`} aria-current={currentCategory === kind ? 'page' : undefined} onClick={() => onOpenCategory?.(kind)}>
                  <Icon size={18} /><span>{label}</span>
                  {alert ? <i className="side-nav__dot side-nav__dot--alert" aria-hidden="true" /> : running ? <i className="side-nav__dot side-nav__dot--active" aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
        )}
        {onEditRooms && home.rooms.length > 1 && <button type="button" className="side-nav__edit" onClick={onEditRooms} title="调整房间顺序" aria-label="调整房间顺序"><ArrowUpDown size={18} /><span>房间排序</span></button>}
        {onOpenMusic && <button type="button" title="音乐" aria-current={current === 'music' ? 'page' : undefined} onClick={onOpenMusic}><Music size={20} /><span>音乐</span></button>}
      </div>
      <div className="side-nav__footer">
        {people && people.length > 0 && (
          <div className="people-bar">
            {people.map((person) => (
              <div key={person.id} className={`people-avatar ${person.home ? 'people-avatar--home' : 'people-avatar--away'}`} title={`${person.name}：${person.home ? '在家' : '不在家'}`}>
                <img src={apiPath(person.image)} alt={person.name} loading="lazy" />
                {person.home && <span className="people-avatar__badge"><House size={10} /></span>}
              </div>
            ))}
          </div>
        )}
        <div className="side-nav__footer-bottom">
          <div className="side-nav__time">
            <span className="side-nav__clock">{formatTime(now)}</span>
          </div>
          <button type="button" className="side-nav__settings" onClick={onSettings} aria-current={current === 'settings' ? 'page' : undefined} aria-label="设置" title="设置"><Settings size={18} /></button>
        </div>
      </div>
    </nav>
  );
}
