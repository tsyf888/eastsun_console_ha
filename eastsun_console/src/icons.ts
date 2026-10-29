/**
 * 房间与情景按钮的可选图标表。存储与传输只保存 kebab 短名（custom.json 的 icon 字段），
 * 与后端 ICON_KEY_RE 一致；遇到未知键时统一回退默认图标，旧数据不会显示成空白。
 */
import {
  AirVent, Aperture, Archive, Armchair, Baby, Bath, BedDouble, BedSingle, Bike, Blinds, BookOpen, Boxes, Briefcase, Building2,
  Car, CircleDot, Clapperboard, Coffee, CookingPot, DoorClosed, DoorOpen, Droplets, Dumbbell, Fan, Fence, Film, Flame, Flower2,
  Gamepad2, Grid2x2, Guitar, Heart, House, Lamp, LampCeiling, LampDesk, LampFloor, LampWallUp, Library, Lightbulb, Lock, LockOpen,
  Monitor, Moon, MoonStar, Mountain, Music, Package, Palette, PartyPopper, PawPrint, Piano, Power, Refrigerator, Server, ShieldCheck,
  ShowerHead, Snowflake, Sofa, Sparkles, Spline, Sprout, Store, Sun, Sunrise, Sunset, Tent, Theater, Thermometer, TreePine, Trees,
  Tv, Umbrella, Users, Utensils, UtensilsCrossed, Warehouse, WashingMachine, Waves, Wine, Wind,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { brandIcons, brandIconKeys } from './brandIcons';

export interface IconChoice {
  key: string;
  label: string;
  Icon: LucideIcon;
}

/** 房间图标；第一项为默认（未选择时使用）。 */
export const ROOM_ICONS: IconChoice[] = [
  { key: 'house', label: '默认', Icon: House },
  { key: 'sofa', label: '客厅', Icon: Sofa },
  { key: 'armchair', label: '起居室', Icon: Armchair },
  { key: 'tv', label: '影音室', Icon: Tv },
  { key: 'utensils-crossed', label: '餐厅', Icon: UtensilsCrossed },
  { key: 'cooking-pot', label: '厨房', Icon: CookingPot },
  { key: 'refrigerator', label: '厨房电器', Icon: Refrigerator },
  { key: 'bed-double', label: '主卧', Icon: BedDouble },
  { key: 'bed-single', label: '卧室', Icon: BedSingle },
  { key: 'baby', label: '儿童房', Icon: Baby },
  { key: 'bath', label: '主卫', Icon: Bath },
  { key: 'shower-head', label: '卫生间', Icon: ShowerHead },
  { key: 'book-open', label: '书房', Icon: BookOpen },
  { key: 'monitor', label: '办公/设备间', Icon: Monitor },
  { key: 'door-open', label: '玄关', Icon: DoorOpen },
  { key: 'flower2', label: '阳台', Icon: Flower2 },
  { key: 'washing-machine', label: '洗衣房', Icon: WashingMachine },
  { key: 'car', label: '车库', Icon: Car },
  { key: 'warehouse', label: '储物间', Icon: Warehouse },
  { key: 'dumbbell', label: '健身房', Icon: Dumbbell },
  { key: 'wine', label: '酒柜/吧台', Icon: Wine },
  { key: 'coffee', label: '茶室/咖啡', Icon: Coffee },
  { key: 'tree-pine', label: '庭院', Icon: TreePine },
  { key: 'building-2', label: '公寓/楼栋', Icon: Building2 },
  { key: 'server', label: '机房/弱电间', Icon: Server },
  { key: 'library', label: '图书角', Icon: Library },
  { key: 'briefcase', label: '工作间', Icon: Briefcase },
  { key: 'archive', label: '储藏柜', Icon: Archive },
  { key: 'package', label: '杂物间', Icon: Package },
  { key: 'boxes', label: '库房', Icon: Boxes },
  { key: 'door-closed', label: '室内门厅', Icon: DoorClosed },
  { key: 'fence', label: '后院', Icon: Fence },
  { key: 'paw-print', label: '宠物房', Icon: PawPrint },
  { key: 'tent', label: '儿童游戏区', Icon: Tent },
  { key: 'theater', label: '家庭影院', Icon: Theater },
  { key: 'piano', label: '琴房', Icon: Piano },
  { key: 'guitar', label: '乐器房', Icon: Guitar },
  { key: 'palette', label: '画室', Icon: Palette },
  { key: 'party-popper', label: '活动室', Icon: PartyPopper },
  { key: 'sprout', label: '花房/绿植', Icon: Sprout },
  { key: 'trees', label: '花园', Icon: Trees },
  { key: 'mountain', label: '露台/山景', Icon: Mountain },
  { key: 'waves', label: '泳池', Icon: Waves },
  { key: 'umbrella', label: '凉台', Icon: Umbrella },
  { key: 'store', label: '商铺', Icon: Store },
  { key: 'bike', label: '自行车房', Icon: Bike },
  { key: 'utensils', label: '早餐区', Icon: Utensils },
];

/** 情景按钮图标；第一项为默认。 */
export const SCENE_ICONS: IconChoice[] = [
  { key: 'sparkles', label: '默认', Icon: Sparkles },
  { key: 'home', label: '回家', Icon: House },
  { key: 'moon', label: '晚安', Icon: Moon },
  { key: 'moon-star', label: '睡眠', Icon: MoonStar },
  { key: 'sun', label: '明亮', Icon: Sun },
  { key: 'sunrise', label: '晨起', Icon: Sunrise },
  { key: 'sunset', label: '傍晚', Icon: Sunset },
  { key: 'lightbulb', label: '灯光', Icon: Lightbulb },
  { key: 'film', label: '观影', Icon: Film },
  { key: 'clapperboard', label: '看电视', Icon: Clapperboard },
  { key: 'music', label: '音乐', Icon: Music },
  { key: 'gamepad2', label: '游戏', Icon: Gamepad2 },
  { key: 'users', label: '聚会', Icon: Users },
  { key: 'book-open', label: '阅读', Icon: BookOpen },
  { key: 'utensils-crossed', label: '用餐', Icon: UtensilsCrossed },
  { key: 'coffee', label: '咖啡', Icon: Coffee },
  { key: 'wine', label: '小酌', Icon: Wine },
  { key: 'heart', label: '浪漫', Icon: Heart },
  { key: 'snowflake', label: '清凉', Icon: Snowflake },
  { key: 'flame', label: '温暖', Icon: Flame },
  { key: 'fan', label: '吹风', Icon: Fan },
  { key: 'droplets', label: '除湿', Icon: Droplets },
  { key: 'wind', label: '通风', Icon: Wind },
  { key: 'shield-check', label: '安防', Icon: ShieldCheck },
  { key: 'lock', label: '锁门', Icon: Lock },
  { key: 'lock-open', label: '开门', Icon: LockOpen },
  { key: 'power', label: '全关', Icon: Power },
  { key: 'blinds', label: '窗帘', Icon: Blinds },
  { key: 'lamp-ceiling', label: '吊灯', Icon: LampCeiling },
  { key: 'spline', label: '灯带', Icon: Spline },
  { key: 'lamp', label: '台灯', Icon: Lamp },
  { key: 'air-vent', label: '换气', Icon: AirVent },
  { key: 'tree-pine', label: '度假', Icon: TreePine },
];

/** 设备图标（设置里给单个实体换图标时的内置页）；品牌图标在 PHU_ICONS 页。 */
export const DEVICE_ICONS: IconChoice[] = [
  { key: 'lightbulb', label: '灯泡', Icon: Lightbulb },
  { key: 'lamp-ceiling', label: '吊灯', Icon: LampCeiling },
  { key: 'grid-2x2', label: '格栅灯', Icon: Grid2x2 },
  { key: 'spline', label: '灯带', Icon: Spline },
  { key: 'circle-dot', label: '筒灯', Icon: CircleDot },
  { key: 'aperture', label: '射灯', Icon: Aperture },
  { key: 'lamp-wall-up', label: '壁灯', Icon: LampWallUp },
  { key: 'lamp-desk', label: '台灯', Icon: LampDesk },
  { key: 'lamp-floor', label: '落地灯', Icon: LampFloor },
  { key: 'lamp', label: '柜灯', Icon: Lamp },
  { key: 'fan', label: '风扇', Icon: Fan },
  { key: 'wind', label: '新风/进风', Icon: Wind },
  { key: 'air-vent', label: '换气', Icon: AirVent },
  { key: 'flame', label: '暖风', Icon: Flame },
  { key: 'snowflake', label: '制冷', Icon: Snowflake },
  { key: 'blinds', label: '窗帘', Icon: Blinds },
  { key: 'thermometer', label: '温度', Icon: Thermometer },
  { key: 'droplets', label: '湿度', Icon: Droplets },
];

/** phu 更多图标页：用户 HA custom-brand-icons 图标集全集（1000+ 图标），实心造型，见 brandIcons.tsx。 */
export const PHU_ICONS: IconChoice[] = brandIconKeys.map((key) => ({
  key,
  label: key,
  Icon: brandIcons[key],
}));

/** 全部可选图标的统一查询表；曾以 phu- 前缀存储的键也映射到同一图标，旧数据不破。 */
const iconLookup = new Map<string, LucideIcon>();
for (const choice of [...ROOM_ICONS, ...SCENE_ICONS, ...DEVICE_ICONS, ...PHU_ICONS]) iconLookup.set(choice.key, choice.Icon);
for (const choice of PHU_ICONS) iconLookup.set(`phu-${choice.key}`, choice.Icon);

/** 房间自定义图标；未知 / 空键返回 null，由调用方回退到按名称猜的图标。 */
export function findRoomIcon(key: string | undefined | null): LucideIcon | null {
  return key ? iconLookup.get(key) ?? null : null;
}

/** 情景按钮图标；未知 / 空键返回默认 Sparkles。 */
export function findSceneIcon(key: string | undefined | null): LucideIcon {
  return (key && iconLookup.get(key)) || Sparkles;
}

/** 设备自定义图标；未知 / 空键返回 null，由调用方回退到自动匹配。 */
export function findAnyIcon(key: string | undefined | null): LucideIcon | null {
  return key ? iconLookup.get(key) ?? null : null;
}
