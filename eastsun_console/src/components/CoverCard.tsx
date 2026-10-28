import { ArrowDownToLine, ArrowUpFromLine, Blinds, CircleStop, SlidersHorizontal, X } from 'lucide-react';
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
  /** 绑定的子窗帘：显示在设置弹窗里（大卡片）；宿主卡片因此获得设置按钮。 */
  childDevices?: CoverDevice[];
  /** 延时关闭（设置弹窗内）：seconds 秒后由服务端关闭窗帘。 */
  onTimerSet: (id: string, seconds: number) => void;
  /** 提前取消延时关闭。 */
  onTimerClear: (id: string) => void;
}

/** 窗帘 / 卷帘卡片：开合开关、位置滑杆（0 全关 - 100 全开）与停止。 */
export function CoverCard({ layout, cover, room, onOpen, onClose, onStop, onPosition, childDevices, onTimerSet, onTimerClear }: CoverCardProps) {
  const { size, editing, hkTiles: hk } = layout;
  // HomeKit 模式：1×1 横排窄卡，2×1 用原版紧凑方形内容，点击按原结构。
  const hkSmall = Boolean(hk) && size === '1x1';
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
  // 打开按钮只在完全打开（100%）时禁用；没有位置反馈的设备退回按状态判断。
  const openDisabled = disabled || (cover.position !== undefined ? position >= 100 : cover.state === 'open');
  // 关闭按钮只在完全关闭（0%）时禁用。
  const closeDisabled = disabled || (cover.position !== undefined ? position <= 0 : cover.state === 'closed');
  // 左上角电源键：开 → 停 → 关 → 停 循环，每次点击只下发一个指令，phase 决定按钮下一次的语义。
  // 小卡空白处点击复用同一套逻辑，不再单独走“开/关反转”。
  const [powerPhase, setPowerPhase] = useState<CoverPowerPhase>(() => initialPowerPhase(cover));
  // 开合到位后把按钮切回“反向动作”：否则按钮会一直停在“停止”，下一次点击发出无效的停止指令。
  // 运动中（opening/closing）不校正，保证“停止”图标在整个运动过程中可见；终态要求状态与位置同时到位，
  // 避免乐观更新提前写出的 open/closed 把停止图标瞬间刷掉。无位置反馈的设备只在确认关闭时校正。
  useEffect(() => {
    if (!cover.available) return;
    if (cover.state === 'opening' || cover.state === 'closing') return;
    if (cover.position !== undefined) {
      if (cover.state === 'open' && cover.position >= 100) setPowerPhase('close');
      else if (cover.state === 'closed' && cover.position <= 0) setPowerPhase('open');
      return;
    }
    if (cover.state === 'closed') setPowerPhase('open');
  }, [cover.available, cover.state, cover.position]);
  const cyclePower = () => {
    if (powerPhase === 'open') {
      onOpen(cover.id);
      setPowerPhase(cover.supportsStop ? 'stopThenClose' : 'close');
      return;
    }
    if (powerPhase === 'close') {
      onClose(cover.id);
      setPowerPhase(cover.supportsStop ? 'stopThenOpen' : 'open');
      return;
    }
    onStop(cover.id);
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
            {cover.supportsPosition && <div className="light-card__range cover-card__range">
              <span className="light-card__control-icon cover-card__control-icon" aria-hidden="true"><Blinds size={16} /></span>
              <input type="range" min="0" max="100" value={position} style={rangeStyle} onChange={(event) => onPosition(cover.id, Number(event.target.value))} disabled={disabled} aria-label={`调整${label}开合位置`} />
              <output>{position}%</output>
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
      <div className="cover-card__buttons cover-card__buttons--dialog">
        <button type="button" className="cover-card__button" onClick={() => onOpen(cover.id)} disabled={!cover.available || (cover.position !== undefined ? position >= 100 : cover.state === 'open')} aria-label={`打开${label}`}><ArrowUpFromLine size={17} /><span>打开</span></button>
        {cover.supportsStop && <button type="button" className="cover-card__button" onClick={() => onStop(cover.id)} disabled={!cover.available} aria-label={`停止${label}`}><CircleStop size={17} /><span>停止</span></button>}
        <button type="button" className="cover-card__button" onClick={() => onClose(cover.id)} disabled={!cover.available || (cover.position !== undefined ? position <= 0 : cover.state === 'closed')} aria-label={`关闭${label}`}><ArrowDownToLine size={17} /><span>关闭</span></button>
      </div>
      {hasChildren && <div className="light-detail-dialog__children">
        <span className="light-detail-dialog__children-title">子窗帘</span>
        <div className="light-detail-dialog__children-grid">
          {childCovers.map((child) => (
            <CoverCard key={child.id} layout={{ id: child.id, label: `${room.name}${child.name}`, size: '2x1', hkTiles: hk }} cover={child} room={room} onOpen={onOpen} onClose={onClose} onStop={onStop} onPosition={onPosition} onTimerSet={onTimerSet} onTimerClear={onTimerClear} />
          ))}
        </div>
      </div>}
      <DelayTimerBlock device={cover} armed={cover.available && (cover.state === 'open' || cover.state === 'opening')} onSet={onTimerSet} onClear={onTimerClear} />
    </dialog>, document.body)}
    </>
  );
}
