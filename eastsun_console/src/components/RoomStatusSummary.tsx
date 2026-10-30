import { BatteryWarning, DoorOpen, Droplets, Fan, Hourglass, Lightbulb, PersonStanding, Power, Radar, ShieldAlert, Thermometer, Waves, Wind } from 'lucide-react';
import { climateSummaryTone, isActiveAlert, isClimate, isLit, isOpenDoor } from '../selectors';
import type { Device, HomeState, SafetyDevice } from '../types';
import type { ActiveListRequest } from './ActiveDevicesDialog';

const lowBatteryThreshold = 20;

export function RoomStatusSummary({ home, roomId, onOpen, onOpenTimers }: { home: HomeState; roomId: string; onOpen: (request: ActiveListRequest) => void; onOpenTimers: () => void }) {
  const devices = home.devices.filter((device) => device.roomId === roomId);
  const alerts = devices.filter(isActiveAlert);
  const lit = devices.filter(isLit).length;
  const openDoors = devices.filter(isOpenDoor);
  const temperature = devices.find((device) => device.kind === 'sensor' && device.metric === 'temperature');
  const humidity = devices.find((device) => device.kind === 'sensor' && device.metric === 'humidity');
  const motions = devices.filter((device): device is SafetyDevice => device.kind === 'safety' && device.sensorType === 'motion');
  // 同一房间的人体移动 / 存在传感器合并：任意一个检测到即为有人；无人时不显示，全部状态未知时提示。
  const motionKnown = motions.filter((device) => device.available && device.status !== 'unknown');
  const occupied = motionKnown.some((device) => device.status === 'alert');
  // 只显示正在运行或不可用的空调 / 地暖；关闭的不占位。
  const activeClimate = devices.filter(isClimate).filter((device) => !device.available || device.on);
  const runningFans = devices.filter((device) => device.kind === 'fan' && device.available && device.on);
  const runningSwitches = devices.filter((device) => device.kind === 'switch' && device.available && device.on);
  const timedDevices = devices.filter((device) => device.timerEndsAt);
  const batteries = home.batteries.filter((battery) => battery.roomId === roomId);
  const lowBatteries = batteries.filter((battery) => battery.available && battery.level !== null && battery.level <= lowBatteryThreshold);
  const unknownBatteries = batteries.filter((battery) => !battery.available || battery.level === null);

  return (
    <div className="status-row" aria-label="房间状态概览">
      {alerts.map((device) => <span key={device.id} className="status-pill status-pill--alert"><ShieldAlert size={15} />{device.name}报警</span>)}
      {lit > 0 && <button type="button" className="status-pill status-pill--light status-pill--button" onClick={() => onOpen({ kind: 'light', roomId })}><Lightbulb size={15} />{lit} 盏灯亮</button>}
      {runningFans.length > 0 && <button type="button" className="status-pill status-pill--cool status-pill--button" onClick={() => onOpen({ kind: 'fan', roomId })}><Fan size={15} />{runningFans.length} 台风扇开启</button>}
      {runningSwitches.length > 0 && <button type="button" className="status-pill status-pill--button" onClick={() => onOpen({ kind: 'switch', roomId })}><Power size={15} />{runningSwitches.length} 个开关打开</button>}
      {timedDevices.length > 0 && <button type="button" className="status-pill status-pill--heat status-pill--button" onClick={onOpenTimers}><Hourglass size={15} />{timedDevices.length} 项正在计时</button>}
      {temperature?.kind === 'sensor' && <span className={`status-pill${temperature.available ? '' : ' status-pill--warning'}`}><Thermometer size={15} />温度 {temperature.available ? `${temperature.value}${temperature.unit}` : '暂无数据'}</span>}
      {humidity?.kind === 'sensor' && <span className={`status-pill${humidity.available ? '' : ' status-pill--warning'}`}><Droplets size={15} />湿度 {humidity.available ? `${humidity.value}${humidity.unit}` : '暂无数据'}</span>}
      {occupied && <span className="status-pill status-pill--home status-pill--occupied" title={`人体感应：${motions.map((device) => device.name).join('、')}`}><PersonStanding size={15} className="presence-blink" />有人</span>}
      {!occupied && motions.length > 0 && motionKnown.length === 0 && <span className="status-pill status-pill--warning" title={`人体感应：${motions.map((device) => device.name).join('、')}`}><Radar size={15} />人体感应状态未知</span>}
      {openDoors.map((device) => <span key={device.id} className="status-pill"><DoorOpen size={15} />{device.name}已打开</span>)}
      {activeClimate.map((device) => device.available
        ? <button key={device.id} type="button" className={`status-pill status-pill--${climateSummaryTone(device)} status-pill--button`} onClick={() => onOpen({ kind: device.kind, roomId })}>{device.kind === 'heating' ? <Waves size={15} /> : <Wind size={15} />}{device.name}打开</button>
        : <span key={device.id} className="status-pill status-pill--warning">{device.kind === 'heating' ? <Waves size={15} /> : <Wind size={15} />}{device.name}不可用</span>)}
      {lowBatteries.length > 0 && <span className="status-pill status-pill--warning"><BatteryWarning size={15} />低电量 {lowBatteries.length} 个设备</span>}
      {unknownBatteries.length > 0 && <span className="status-pill status-pill--warning"><BatteryWarning size={15} />电池状态未知 {unknownBatteries.length} 个设备</span>}
    </div>
  );
}

/**
 * 类别详情页顶部的状态条：与房间页一致，把正在运行的设备按类型汇总成按钮。
 * 点按钮打开 ActiveDevicesDialog（不限定房间），可逐个开关或一键全部关闭。
 */
export function CategoryStatusSummary({ devices, onOpen }: { devices: Device[]; onOpen: (request: ActiveListRequest) => void }) {
  const visible = devices.filter((device) => !device.hidden);
  const lit = visible.filter(isLit).length;
  const runningFans = visible.filter((device) => device.kind === 'fan' && device.available && device.on).length;
  const runningSwitches = visible.filter((device) => device.kind === 'switch' && device.available && device.on).length;
  const activeClimate = visible.filter(isClimate).filter((device) => device.available && device.on);
  const acCount = activeClimate.filter((device) => device.kind === 'climate').length;
  const heatingCount = activeClimate.filter((device) => device.kind === 'heating').length;
  if (lit === 0 && runningFans === 0 && runningSwitches === 0 && acCount === 0 && heatingCount === 0) return null;
  return (
    <div className="status-row" aria-label="类别状态概览">
      {lit > 0 && <button type="button" className="status-pill status-pill--light status-pill--button" onClick={() => onOpen({ kind: 'light' })}><Lightbulb size={15} />{lit} 盏灯亮</button>}
      {acCount > 0 && <button type="button" className="status-pill status-pill--cool status-pill--button" onClick={() => onOpen({ kind: 'climate' })}><Wind size={15} />{acCount} 个空调开启</button>}
      {heatingCount > 0 && <button type="button" className="status-pill status-pill--heat status-pill--button" onClick={() => onOpen({ kind: 'heating' })}><Waves size={15} />{heatingCount} 个制热开启</button>}
      {runningFans > 0 && <button type="button" className="status-pill status-pill--cool status-pill--button" onClick={() => onOpen({ kind: 'fan' })}><Fan size={15} />{runningFans} 台风扇开启</button>}
      {runningSwitches > 0 && <button type="button" className="status-pill status-pill--button" onClick={() => onOpen({ kind: 'switch' })}><Power size={15} />{runningSwitches} 个开关打开</button>}
    </div>
  );
}
