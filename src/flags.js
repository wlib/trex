export const defaultWidth = 600;
export const FPS = 60;
export const isHiDPI = window.devicePixelRatio > 1;
export const isIOS = /iPad|iPhone|iPod/.test(window.navigator.platform);
export const isMobile = /Android/.test(window.navigator.userAgent) || isIOS;
export const isTouchEnabled = "ontouchstart" in window;
export const arcadeModeURL = "chrome://dino/";
