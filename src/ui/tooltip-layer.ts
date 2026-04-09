export interface TooltipLayer {
  root: HTMLElement;
  show(content: { title: string; body: string }, pos: { x: number; y: number }): void;
  hide(): void;
}

export function createTooltipLayer(container: HTMLElement): TooltipLayer {
  const root = document.createElement('div');
  root.style.cssText = 'position:absolute;pointer-events:none;display:none;z-index:40;background:rgba(0,0,0,0.9);border:1px solid rgba(255,255,255,0.18);border-radius:10px;padding:8px 10px;color:white;max-width:220px;';

  const title = document.createElement('div');
  title.style.cssText = 'font-weight:700;font-size:12px;';
  const body = document.createElement('div');
  body.style.cssText = 'font-size:11px;opacity:0.9;margin-top:4px;';

  root.appendChild(title);
  root.appendChild(body);
  container.appendChild(root);

  return {
    root,
    show(content, pos) {
      title.textContent = content.title;
      body.textContent = content.body;
      root.style.left = `${pos.x}px`;
      root.style.top = `${pos.y}px`;
      root.style.display = 'block';
    },
    hide() {
      root.style.display = 'none';
    },
  };
}
