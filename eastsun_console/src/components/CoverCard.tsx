import { ArrowDownToLine, ArrowUpFromLine, Blinds, CircleStop, RotateCw, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { releasePointerFocus } from '../focus';
import type { CoverDevice, Room } from '../types';
import { DelayTimerBlock } from './DelayTimer';
import { TileFrame } from './TileFrame';
import type { TileLayoutProps } from './TileFrame';

/**
 * 电源键的四段循环：打开 → 停止 → 关闭 → 停止 → 再打开…
 * 不支持停止的设备（supportsStop 为 false）退化为 打开 ↔ 关闭 两段。
 */
type CoverPowerPhase = 'open' | 'stopThenClose' | 'close' | 'stopThenOpen';

const powerPhaseLabels: Record<CoverPowerPhase, string> = {
  open: '打开',
  stopThenClose: '停止',
  close: '关闭',
  stopThenOpen: '停止',
};

/** 指令刚发出后的静默期：这段时间设备状态可能还是旧值或乐观值，按钮必须保持"停止"。 */
const holdMs = 2_000;
/** 到达终态的信号需要稳定这么久才信：防止乐观更新、驱动抖动短暂上报终态后立刻翻转。 */
const holdArrivedMs = 800;
/** 兜底等待：设备一直不上报终态时也切回反向动作，避免按钮永远停在"停止"。 */
const maxWaitMs = 60_000;

/** 循环起点按当前状态推断：已关（或状态未知）从“打开”开始，其余从“关闭”开始。 */
function initialPowerPhase(cover: CoverDevice): CoverPowerPhase {
  const closed = cover.position !== undefined ? cover.position <= 0 : cover.state === 'closed';
  return closed || cover.state === 'unknown' ? 'open' : 'close';
}

interface CoverCardProps {
  layout: TileLayoutProps;
  cover: CoverDevice;
  room: Room;
  onOpen: (id: string) => void;
  onClose: (id: string) => void;
  onStop: (id: string) => void;
  onPosition: (id: string, position: number) => void;
  /** 调整倾斜角度（0–100，界面按 0–180° 展示）。 */
  onTilt: (id: string, tilt: number) => void;
  /** 绑定的子窗帘：显示在设置弹窗里（大卡片）；宿主卡片因此获得设置按钮。 */
  childDevices?: CoverDevice[];
  /** 延时关闭（设置弹窗内）：seconds 秒后由服务端关闭窗帘。 */
  onTimerSet: (id: string, seconds: number) => void;
  /** 提前取消延时关闭。 */
  onTimerClear: (id: string) => void;
}

/** 窗帘 / 卷帘卡片：开合开关、位置滑杆（0 全关 - 100 全开）与停止。 */
export function CoverCard({ layout, cover, room, onOpen, onClose, onStop, onPosition, onTilt, childDevices, onTimerSet, onTimerClear }: CoverCardProps) {
  const { size, editing, hkTiles: hk } = layout;
  // HomeKit 模式：所有尺寸都用横排窄卡（滑杆与角度切换移到详情弹窗）。
  const hkSmall = Boolean(hk);
  const compact = size === '1x1' || Boolean(hk);
  const childCovers = childDevices ?? [];
  const hasChildren = childCovers.length > 0;
  const disabled = !cover.available || Boolean(editing);
  const moving = cover.state === 'opening' || cover.state === 'closing';
  const active = cover.state === 'open' || moving;
  const position = cover.position ?? 0;
  const status = !cover.available
    ? '设备不可用'
    : cover.state === 'opening'
      ? '正在打开…'
      : cover.state === 'closing'
        ? '正在关闭…'
        : cover.state === 'open'
          ? cover.position !== undefined ? `已打开 · ${cover.position}%` : '已打开'
          : cover.state === 'closed'
            ? '已关闭'
            : '状态未知';
  const rangeStyle = { '--range-progress': `${position}%` } as CSSProperties;
  // 宽卡空间固定：同时支持开合与倾角时用「开合 / 角度」分段切换，复用同一条滑杆（角度按 0–180° 展示）。
  const [tiltMode, setTiltMode] = useState(false);
  const rangeMode = cover.supportsTilt && (!cover.supportsPosition || tiltMode) ? 'tilt' : 'position';
  const tiltDegrees = Math.round((cover.tilt ?? 0) * 1.8);
  const tiltStyle = { '--range-progress': `${(tiltDegrees / 180) * 100}%` } as CSSProperties;
  // 打开按钮只在完全打开（100%）时禁用；没有位置反馈的设备退回按状态判断。
  const openDisabled = disabled || (cover.position !== undefined ? position >= 100 : cover.state === 'open');
  // 关闭按钮只在完全关闭（0%）时禁用。
  const closeDisabled = disabled || (cover.position !== undefined ? position <= 0 : cover.state === 'closed');
  // 左上角电源键：开 → 停 → 关 → 停 循环，每次点击只下发一个指令，phase 决定按钮下一次的语义。
  // 小卡空白处点击复用同一套逻辑，不再单独走“开/关反转”。
  const [powerPhase, setPowerPhase] = useState<CoverPowerPhase>(() => initialPowerPhase(cover));
  // 乐观更新会在指令刚发出时就把状态写成终态，此时用设备状态反推按钮，“停止”会一闪而过。
  // 因此记录本次下发的方向：运动期间一律保持“停止”，确认到位或兜底超时后再切成反向动作。
  const intentRef = useRef<{ target: 'open' | 'close'; since: number; stableSince: number | null } | null>(null);
  const [recheckTick, setRecheckTick] = useState(0);
  useEffect(() => {
    if (!cover.available) { intentRef.current = null; return; }
    const intent = intentRef.current;
    if (intent) {
      const elapsed = Date.now() - intent.since;
      const moving = cover.state === 'opening' || cover.state === 'closing';
      const targetReached = intent.target === 'open'
        ? cover.position !== undefined ? cover.position >= 99 : cover.state === 'open'
        : cover.position !== undefined ? cover.position <= 1 : cover.state === 'closed';
      // 运动中、静默期内（刚发指令状态可能还是旧值或乐观值）：一律保持停止。
      if (elapsed < holdMs || moving) { intent.stableSince = null; return; }
      // 到达终态：需要稳定 holdArrivedMs 才算真到位（防止 HA 短暂误报）。
      if (targetReached) {
        if (intent.stableSince === null) intent.stableSince = Date.now();
        if (Date.now() - intent.stableSince >= holdArrivedMs) {
          intentRef.current = null;
          setPowerPhase(intent.target === 'open' ? 'close' : 'open');
        }
        return;
      }
      // 未到达终态但已出静默期：继续等，不清空稳定时间。
      if (elapsed >= maxWaitMs) {
        intentRef.current = null;
        setPowerPhase(intent.target === 'open' ? 'close' : 'open');
      }
      return;
    }
    // 没有待确认的操作（初始挂载、外部控制）：按设备终态同步按钮语义。
    if (cover.state === 'opening' || cover.state === 'closing') return;
    if (cover.position !== undefined) {
      if (cover.state === 'open' && cover.position >= 100) setPowerPhase('close');
      else if (cover.state === 'closed' && cover.position <= 0) setPowerPhase('open');
    } else if (cover.state === 'closed') setPowerPhase('open');
  }, [cover.available, cover.state, cover.position, recheckTick]);
  // 等待到位期间每秒复查一次：HA 不一定在结束瞬间推送终态，只靠状态更新可能等不到。
  useEffect(() => {
    if (!intentRef.current) return;
    const timer = window.setTimeout(() => setRecheckTick((value) => value + 1), 1000);
    return () => window.clearTimeout(timer);
  }, [powerPhase, recheckTick]);
  const cyclePower = () => {
    if (powerPhase === 'open') {
      onOpen(cover.id);
      intentRef.current = { target: 'open', since: Date.now(), stableSince: null };
      setPowerPhase(cover.supportsStop ? 'stopThenClose' : 'close');
      return;
    }
    if (powerPhase === 'close') {
      onClose(cover.id);
      intentRef.current = { target: 'close', since: Date.now(), stableSince: null };
      setPowerPhase(cover.supportsStop ? 'stopThenOpen' : 'open');
      return;
    }
    onStop(cover.id);
    intentRef.current = null;
    setPowerPhase(powerPhase === 'stopThenClose' ? 'close' : 'open');
  };
  const powerIcon = powerPhase === 'open'
    ? <ArrowUpFromLine size={21} />
    : powerPhase === 'close'
      ? <ArrowDownToLine size={21} />
      : <CircleStop size={21} />;
  const label = `${room.name}${cover.name}`;
  const detailId = useId();
  const detailRef = useRef<HTMLDialogElement>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  useEffect(() => { if (detailOpen && detailRef.current && !detailRef.current.open) detailRef.current.showModal(); }, [detailOpen]);
  useEffect(() => { if (disabled) setDetailOpen(false); }, [disabled]);

  const powerButton = (
    <button type="button" className="tile__power" onClick={cyclePower} disabled={disabled} aria-label={`${powerPhaseLabels[powerPhase]}${label}`} aria-pressed={active} title={`${powerPhaseLabels[powerPhase]}${label}`}>{powerIcon}</button>
  );

  const wideButtons = (
    <div className="cover-card__buttons">
      <button type="button" className="cover-card__button" onClick={() => onOpen(cover.id)} disabled={openDisabled} aria-label={`打开${label}`}><ArrowUpFromLine size={17} /><span>打开</span></button>
      {cover.supportsStop && <button type="button" className="cover-card__button" onClick={() => onStop(cover.id)} disabled={disabled} aria-label={`停止${label}`}><CircleStop size={17} /><span>停止</span></button>}
      <button type="button" className="cover-card__button" onClick={() => onClose(cover.id)} disabled={closeDisabled} aria-label={`关闭${label}`}><ArrowDownToLine size={17} /><span>关闭</span></button>
    </div>
  );

  return (
    <>
    <TileFrame {...layout} hkTiles={hkSmall} className={`cover-card${compact ? ' cover-card--compact' : ''}`} active={active} onOpen={compact && cover.available ? cyclePower : undefined} onLongPress={hkSmall && cover.available ? () => setDetailOpen(true) : undefined}>
      {!compact ? (
        <>
          <div className="tile__top">
            {powerButton}
            <div className="light-card__identity"><span className="tile__room tile__room--inline" aria-hidden="true">{room.name}</span><span className="tile__name">{cover.name}</span><span className="tile__note">{status}</span></div>
            <span className="tile__room">{room.name}</span>
            {/* HomeKit 模式：齿轮隐藏，长按卡片弹出同样的设置弹窗（含子窗帘大卡片）。 */}
            {hasChildren && !editing && !hkSmall && <button type="button" className="light-card__settings" onClick={() => setDetailOpen(true)} disabled={!cover.available} aria-label={`设置${label}与它的子窗帘`} aria-haspopup="dialog" aria-controls={detailOpen ? detailId : undefined}><SlidersHorizontal size={18} /></button>}
          </div>
          <div className="light-card__controls">
            {(cover.supportsPosition || cover.supportsTilt) && <div className={`light-card__range cover-card__range${cover.supportsPosition && cover.supportsTilt ? ' cover-card__range--mode' : ''}`}>
              {cover.supportsPosition && cover.supportsTilt ? (
                <div className="cover-card__mode" role="group" aria-label={`${label}控制对象`}>
                  <button type="button" className={rangeMode === 'position' ? 'is-active' : undefined} aria-pressed={rangeMode === 'position'} onClick={() => setTiltMode(false)} disabled={disabled}>开合</button>
                  <button type="button" className={rangeMode === 'tilt' ? 'is-active' : undefined} aria-pressed={rangeMode === 'tilt'} onClick={() => setTiltMode(true)} disabled={disabled}>角度</button>
                </div>
              ) : (
                <span className="light-card__control-icon cover-card__control-icon" aria-hidden="true">
                  {cover.supportsTilt ? <RotateCw size={16} /> : <Blinds size={16} />}
                </span>
              )}
              {rangeMode === 'tilt' ? (
                <input type="range" min="0" max="180" value={tiltDegrees} style={tiltStyle} onChange={(event) => onTilt(cover.id, Math.round(Number(event.target.value) / 1.8))} disabled={disabled} aria-label={`调整${label}倾斜角度`} />
              ) : (
                <input type="range" min="0" max="100" value={position} style={rangeStyle} onChange={(event) => onPosition(cover.id, Number(event.target.value))} disabled={disabled} aria-label={`调整${label}开合位置`} />
              )}
              <output>{rangeMode === 'tilt' ? `${tiltDegrees}°` : `${position}%`}</output>
            </div>}
            {wideButtons}
          </div>
        </>
      ) : (
        <>
          <div className="tile__top">
            {powerButton}
            <span className="tile__room">{room.name}</span>
          </div>
          <div className="cover-card__compact-bottom">
            <div className="light-card__identity"><span className="tile__room tile__room--inline" aria-hidden="true">{room.name}</span><span className="tile__name">{cover.name}</span><span className="tile__note">{status}</span></div>
            {compact && !editing && !hkSmall && <button type="button" className="light-card__settings" onClick={() => setDetailOpen(true)} disabled={!cover.available} aria-label={`设置${label}开合位置、打开关闭和停止`} aria-haspopup="dialog" aria-controls={detailOpen ? detailId : undefined}><SlidersHorizontal size={18} /></button>}
          </div>
        </>
      )}
    </TileFrame>
    {detailOpen && createPortal(<dialog ref={detailRef} id={detailId} className="light-detail-dialog" aria-labelledby={`${detailId}-title`} onClose={() => { setDetailOpen(false); releasePointerFocus(); }} onCancel={() => setDetailOpen(false)} onClick={(e) => { if (e.target === e.currentTarget) setDetailOpen(false); }}>
      <div className="light-detail-dialog__heading"><div><small>{room.name}</small><h2 id={`${detailId}-title`}>{cover.name}</h2></div><button type="button" onClick={() => setDetailOpen(false)} autoFocus aria-label="关闭窗帘控制"><X size={20} /></button></div>
      {cover.supportsPosition && <div className="light-detail-dialog__control"><div><label htmlFor={`${detailId}-position`}>开合位置</label><output>{position}%</output></div><input id={`${detailId}-position`} type="range" min="0" max="100" value={position} style={rangeStyle} onChange={(event) => onPosition(cover.id, Number(event.target.value))} disabled={!cover.available} /></div>}
      {/* 小卡与设置弹窗也要能调角度：宽卡用分段切换复用一条滑杆，弹窗空间足够则单列一行。 */}
      {cover.supportsTilt && <div className="light-detail-dialog__control"><div><label htmlFor={`${detailId}-tilt`}>倾斜角度</label><output>{tiltDegrees}°</output></div><input id={`${detailId}-tilt`} type="range" min="0" max="180" value={tiltDegrees} style={tiltStyle} onChange={(event) => onTilt(cover.id, Math.round(Number(event.target.value) / 1.8))} disabled={!cover.available} /></div>}
      <div className="cover-card__buttons cover-card__buttons--dialog">
        <button type="button" className="cover-card__button" onClick={() => onOpen(cover.id)} disabled={!cover.available || (cover.position !== undefined ? position >= 100 : cover.state === 'open')} aria-label={`打开${label}`}><ArrowUpFromLine size={17} /><span>打开</span></button>
        {cover.supportsStop && <button type="button" className="cover-card__button" onClick={() => onStop(cover.id)} disabled={!cover.available} aria-label={`停止${label}`}><CircleStop size={17} /><span>停止</span></button>}
        <button type="button" className="cover-card__button" onClick={() => onClose(cover.id)} disabled={!cover.available || (cover.position !== undefined ? position <= 0 : cover.state === 'closed')} aria-label={`关闭${label}`}><ArrowDownToLine size={17} /><span>关闭</span></button>
      </div>
      {hasChildren && <div className="light-detail-dialog__children">
        <span className="light-detail-dialog__children-title">子窗帘</span>
        <div className="light-detail-dialog__children-grid">
          {childCovers.map((child) => (
            <CoverCard key={child.id} layout={{ id: child.id, label: `${room.name}${child.name}`, size: '2x1', hkTiles: hk }} cover={child} room={room} onOpen={onOpen} onClose={onClose} onStop={onStop} onPosition={onPosition} onTilt={onTilt} onTimerSet={onTimerSet} onTimerClear={onTimerClear} />
          ))}
        </div>
      </div>}
      <DelayTimerBlock device={cover} armed={cover.available && (cover.state === 'open' || cover.state === 'opening')} onSet={onTimerSet} onClear={onTimerClear} />
    </dialog>, document.body)}
    </>
  );
}
