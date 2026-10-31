/** 主题：浅色 / 深色 / 自动（日出到日落浅色，其余深色）。设置为全局（设置 → 显示），实际主题按本屏的天气与时间计算。 */
import type { Forecast } from './weather';
import type { SceneStyle } from './consoleClient';

export type ThemeMode = 'dark' | 'light' | 'auto';
export type Theme = 'dark' | 'light';

const cacheKey = 'hass-home-console-theme-v1';
const themeColors: Record<Theme, string> = { dark: '#0d0f11', light: '#f2f1ed' };
export const DEFAULT_SUNRISE = '06:00';
export const DEFAULT_SUNSET = '18:00';

function minutesOf(time: string | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(time ?? '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** 当天日出、日落：取天气预报中今天的数据；没有天气（未配置或未获取到）时按 06:00 与 18:00。 */
export function daylight(forecast: Forecast | null, now: Date): { sunrise: string; sunset: string } {
  const today = forecast?.daily.find((day) => day.fxDate === localDate(now));
  const sunrise = minutesOf(today?.sunrise) !== null ? today!.sunrise : DEFAULT_SUNRISE;
  const sunset = minutesOf(today?.sunset) !== null ? today!.sunset : DEFAULT_SUNSET;
  return { sunrise, sunset };
}

export function resolveTheme(mode: ThemeMode, now: Date, forecast: Forecast | null): Theme {
  if (mode !== 'auto') return mode;
  const { sunrise, sunset } = daylight(forecast, now);
  const current = now.getHours() * 60 + now.getMinutes();
  return current >= minutesOf(sunrise)! && current < minutesOf(sunset)! ? 'light' : 'dark';
}

/** 应用到页面并记住，下次打开时在连接服务之前先用上次的主题，避免闪烁。 */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColors[theme]);
  try {
    localStorage.setItem(cacheKey, theme);
  } catch {
    // 浏览器禁用存储时只影响下次打开的首帧。
  }
}

export function cachedTheme(): Theme {
  try {
    return localStorage.getItem(cacheKey) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** 强调色（设置 → 显示）：选中态、主按钮、导航高亮等使用；灯光光晕、亮度条、冷暖色、告警色按含义保持不变。 */
export const ACCENTS = [
  { value: 'amber', label: '琥珀', swatch: '#f4b764' },
  { value: 'coral', label: '珊瑚', swatch: '#ff8f73' },
  { value: 'rose', label: '玫瑰', swatch: '#f47fa6' },
  { value: 'violet', label: '紫罗兰', swatch: '#a894ff' },
  { value: 'sky', label: '天蓝', swatch: '#6fb8ff' },
  { value: 'teal', label: '青绿', swatch: '#4fd1c1' },
  { value: 'green', label: '草绿', swatch: '#7fd67a' },
  { value: 'blue', label: '苹果蓝', swatch: '#0a84ff' },
  { value: 'indigo', label: '靛蓝', swatch: '#5e5ce6' },
  { value: 'purple', label: '薰衣紫', swatch: '#bf5af2' },
  { value: 'pink', label: '樱花粉', swatch: '#ff375f' },
  { value: 'orange', label: '活力橙', swatch: '#ff9f0a' },
  { value: 'yellow', label: '柠檬黄', swatch: '#ffd60a' },
  { value: 'mint', label: '薄荷', swatch: '#63e6e2' },
  { value: 'cyan', label: '冰青', swatch: '#64d2ff' },
] as const;
export type Accent = (typeof ACCENTS)[number]['value'];

const accentCacheKey = 'hass-home-console-accent-v1';

function isAccent(value: unknown): value is Accent {
  return ACCENTS.some((item) => item.value === value);
}

/** 写到根元素的 data-accent（琥珀为默认，不写属性），并记住给下次打开的首帧用。 */
export function applyAccent(accent: Accent): void {
  if (accent === 'amber') delete document.documentElement.dataset.accent;
  else document.documentElement.dataset.accent = accent;
  try {
    localStorage.setItem(accentCacheKey, accent);
  } catch {
    // 浏览器禁用存储时只影响下次打开的首帧。
  }
}

export function cachedAccent(): Accent {
  try {
    const value = localStorage.getItem(accentCacheKey);
    return isAccent(value) ? value : 'amber';
  } catch {
    return 'amber';
  }
}

/**
 * UI 风格（设置 → 显示）：在主题与强调色之上换一套表面材质、圆角与阴影，可任意组合。
 * iOS26 玻璃为默认风格（服务端 STYLES[0]），iOS17 经典保留为可选，选择后不写 data-style 属性。
 */
export const STYLES = [
  { value: 'ios17', label: 'iOS17 经典', hint: '原有毛玻璃' },
  { value: 'glass26', label: 'iOS26 玻璃', hint: '通透大圆角' },
  { value: 'jelly', label: '果冻多彩', hint: '高饱和渐变' },
  { value: 'ink', label: '素墨黑白', hint: '灰阶纸面' },
  { value: 'helm', label: '夜航仪表仓', hint: '深色仪表' },
  { value: 'courtyard', label: '庭院新中式', hint: '纸色木纹' },
  { value: 'porcelain', label: '青瓷', hint: '青白釉面' },
  { value: 'neon', label: '霓虹夜', hint: '洋红青蓝发光' },
  { value: 'sand', label: '暖沙', hint: '哑光暖米色' },
  { value: 'atelier', label: '雅致', hint: '克制高级哑光' },
] as const;
export type Style = (typeof STYLES)[number]['value'];

const styleCacheKey = 'hass-home-console-style-v1';

function isStyle(value: unknown): value is Style {
  return STYLES.some((item) => item.value === value);
}

/** 写到根元素的 data-style（iOS17 经典不写属性），并记住给下次打开的首帧用。 */
export function applyStyle(style: Style): void {
  if (style === 'ios17') delete document.documentElement.dataset.style;
  else document.documentElement.dataset.style = style;
  try {
    localStorage.setItem(styleCacheKey, style);
  } catch {
    // 浏览器禁用存储时只影响下次打开的首帧。
  }
}

export function cachedStyle(): Style {
  try {
    const value = localStorage.getItem(styleCacheKey);
    return isStyle(value) ? value : 'glass26';
  } catch {
    return 'glass26';
  }
}

/** 本机显示（设置 → 本机显示）：显示范围为“自定义”时，每块屏幕自己的主题、强调色、风格与格子大小。 */
const LOCAL_THEME_KEY = 'eastsun.appearance.theme';
const LOCAL_ACCENT_KEY = 'eastsun.appearance.accent';
const LOCAL_STYLE_KEY = 'eastsun.appearance.style';
const LOCAL_SCENE_STYLE_KEY = 'eastsun.appearance.sceneStyle';
const LOCAL_SCALE_KEY = 'eastsun.appearance.scale';
export const LOCAL_APPEARANCE_EVENT = 'eastsun-appearance';

export interface LocalAppearance {
  theme?: ThemeMode;
  accent?: Accent;
  style?: Style;
  /** 情景模式按钮风格；未设置时沿用全局 custom.json。 */
  sceneStyle?: SceneStyle;
  tileScale?: number;
}

function isSceneStyle(value: string | null): value is SceneStyle {
  return value === 'sharp' || value === 'block' || value === 'capsule' || value === 'soft' || value === 'glass'
    || value === 'gradient' || value === 'outline' || value === 'solid' || value === 'circle';
}

/** 读取本机外观设置；没有设置过的项留空，由调用方回退到全局设置。 */
export function readLocalAppearance(): LocalAppearance {
  const result: LocalAppearance = {};
  try {
    const theme = localStorage.getItem(LOCAL_THEME_KEY);
    if (theme === 'dark' || theme === 'light' || theme === 'auto') result.theme = theme;
    const accent = localStorage.getItem(LOCAL_ACCENT_KEY);
    if (isAccent(accent)) result.accent = accent;
    const style = localStorage.getItem(LOCAL_STYLE_KEY);
    if (isStyle(style)) result.style = style;
    const sceneStyle = localStorage.getItem(LOCAL_SCENE_STYLE_KEY);
    if (isSceneStyle(sceneStyle)) result.sceneStyle = sceneStyle;
    const scale = Number(localStorage.getItem(LOCAL_SCALE_KEY));
    if (Number.isFinite(scale) && scale >= 80 && scale <= 120) result.tileScale = Math.round(scale);
  } catch {
    // 浏览器禁用存储时按未设置处理，全部回退到全局。
  }
  return result;
}

/** 保存本机外观并通知页面立即生效。 */
export function saveLocalAppearance(patch: LocalAppearance): void {
  try {
    if (patch.theme) localStorage.setItem(LOCAL_THEME_KEY, patch.theme);
    if (patch.accent) localStorage.setItem(LOCAL_ACCENT_KEY, patch.accent);
    if (patch.style) localStorage.setItem(LOCAL_STYLE_KEY, patch.style);
    if (patch.sceneStyle) localStorage.setItem(LOCAL_SCENE_STYLE_KEY, patch.sceneStyle);
    if (typeof patch.tileScale === 'number') localStorage.setItem(LOCAL_SCALE_KEY, String(patch.tileScale));
  } catch {
    // 存储不可用时只影响本次刷新前的效果。
  }
  window.dispatchEvent(new Event(LOCAL_APPEARANCE_EVENT));
}

/** 清除本机外观设置，回到跟随全局。 */
export function resetLocalAppearance(): void {
  try {
    localStorage.removeItem(LOCAL_THEME_KEY);
    localStorage.removeItem(LOCAL_ACCENT_KEY);
    localStorage.removeItem(LOCAL_STYLE_KEY);
    localStorage.removeItem(LOCAL_SCENE_STYLE_KEY);
    localStorage.removeItem(LOCAL_SCALE_KEY);
  } catch {
    // 忽略存储不可用。
  }
  window.dispatchEvent(new Event(LOCAL_APPEARANCE_EVENT));
}
