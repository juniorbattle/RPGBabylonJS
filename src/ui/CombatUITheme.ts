export const COMBAT_UI = {
  panelBackground: 'linear-gradient(180deg, rgba(10,16,28,0.965), rgba(5,9,16,0.965))',
  panelBackgroundSoft: 'linear-gradient(180deg, rgba(13,20,34,0.925), rgba(7,11,18,0.94))',
  panelBorder: '1px solid rgba(202,164,90,0.56)',
  panelBorderSoft: '1px solid rgba(202,164,90,0.36)',
  panelShadow: '0 18px 48px rgba(0,0,0,0.58), inset 0 1px 0 rgba(255,255,255,0.08)',
  panelShadowStrong: '0 24px 70px rgba(0,0,0,0.66), inset 0 1px 0 rgba(255,255,255,0.08)',
  gold: '#caa45a',
  goldBright: '#f0cf7a',
  text: '#f4ead2',
  textMuted: '#9aa4b8',
  blue: '#4da3ff',
};

export function applyNoblePanel(el: HTMLElement, strong = false): void {
  Object.assign(el.style, {
    background: strong ? COMBAT_UI.panelBackground : COMBAT_UI.panelBackgroundSoft,
    backdropFilter: 'blur(16px)',
    border: strong ? COMBAT_UI.panelBorder : COMBAT_UI.panelBorderSoft,
    borderRadius: '8px',
    boxShadow: strong ? COMBAT_UI.panelShadowStrong : COMBAT_UI.panelShadow,
  });
  if (!el.style.position) {
    el.style.position = 'relative';
  }
}

export function addPanelCorners(el: HTMLElement, size = 14): void {
  const corners: Array<Partial<CSSStyleDeclaration>> = [
    { top: '5px', left: '5px', borderRight: '0', borderBottom: '0' },
    { top: '5px', right: '5px', borderLeft: '0', borderBottom: '0' },
    { bottom: '5px', left: '5px', borderRight: '0', borderTop: '0' },
    { bottom: '5px', right: '5px', borderLeft: '0', borderTop: '0' },
  ];

  corners.forEach(style => {
    const corner = document.createElement('span');
    Object.assign(corner.style, {
      position: 'absolute',
      width: `${size}px`,
      height: `${size}px`,
      border: `1px solid ${COMBAT_UI.gold}`,
      opacity: '0.82',
      pointerEvents: 'none',
      boxSizing: 'border-box',
    }, style);
    el.appendChild(corner);
  });
}
