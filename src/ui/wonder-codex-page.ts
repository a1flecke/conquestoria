import type { WonderCodexAction, WonderCodexPageViewModel, WonderCodexResponsiveMode } from '@/systems/wonder-codex/presentation';
import { getWonderSpectacleRenderMode } from '@/systems/wonder-spectacle/presentation';
import type { WonderSpectacleRenderMode } from '@/systems/wonder-spectacle/types';
import { createGameButton } from '@/ui/ui-kit';
import { createWonderSpectacleVignette } from '@/ui/wonder-spectacle-vignette';
import { createWonderVignette } from '@/ui/wonder-vignette';

export interface WonderCodexPageOptions {
  mode?: WonderCodexResponsiveMode;
  reducedMotion?: boolean;
  onAction: (action: WonderCodexAction) => void;
  onSelectRelated: (wonderId: string) => void;
}

function appendText(parent: HTMLElement, tag: keyof HTMLElementTagNameMap, text: string, style?: string): HTMLElement {
  const el = document.createElement(tag);
  el.textContent = text;
  if (style) el.style.cssText = style;
  parent.appendChild(el);
  return el;
}

function createSectionList(page: WonderCodexPageViewModel, mode: WonderCodexResponsiveMode): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:grid;gap:10px;';
  for (const section of page.sections) {
    if (mode === 'mobile') {
      const details = document.createElement('details');
      details.dataset.codexSection = section.kind;
      details.style.cssText = 'border-top:1px solid rgba(255,255,255,0.12);padding-top:8px;';
      const summary = document.createElement('summary');
      summary.textContent = section.heading;
      summary.style.cssText = 'cursor:pointer;color:#f4d188;font-weight:700;';
      details.appendChild(summary);
      appendText(details, 'p', section.body, 'margin:8px 0 0;font-size:13px;line-height:1.5;color:rgba(248,241,223,0.82);');
      wrapper.appendChild(details);
    } else {
      const block = document.createElement('section');
      block.dataset.codexSection = section.kind;
      block.style.cssText = 'border-top:1px solid rgba(255,255,255,0.10);padding-top:10px;';
      appendText(block, 'h4', section.heading, 'margin:0 0 5px;font-size:13px;color:#f4d188;');
      appendText(block, 'p', section.body, 'margin:0;font-size:13px;line-height:1.5;color:rgba(248,241,223,0.82);');
      wrapper.appendChild(block);
    }
  }
  return wrapper;
}

export function createWonderCodexPage(
  page: WonderCodexPageViewModel,
  options: WonderCodexPageOptions,
): HTMLElement {
  const mode = options.mode ?? 'desktop';
  const reducedMotion = options.reducedMotion ?? false;
  type CodexSpectacleMode = Extract<WonderSpectacleRenderMode, 'codex-ambient' | 'codex-static' | 'reveal-amplified' | 'reveal-static'>;
  const initialSpectacleMode = getWonderSpectacleRenderMode({
    surface: 'codex',
    wonderId: page.id,
    discovered: page.kind === 'natural',
    reducedMotion,
  });
  let codexSpectacleMode: CodexSpectacleMode =
    initialSpectacleMode === 'codex-ambient' || initialSpectacleMode === 'codex-static'
      ? initialSpectacleMode
      : 'codex-static';
  let vignetteHost: HTMLElement | null = null;
  let replayTimer: number | null = null;

  function renderVignette(): HTMLElement {
    if (page.kind === 'natural') {
      return createWonderSpectacleVignette({
        wonderId: page.id,
        name: page.title,
        mode: codexSpectacleMode,
        reducedMotion,
      });
    }

    return createWonderVignette({
      kind: page.kind,
      wonderId: page.id,
      visibility: 'masked',
      name: page.title,
      visual: page.visual,
      canViewOnMap: false,
      maskedLabel: page.stateLabel,
      stateLabel: page.stateLabel,
    }, { reducedMotion });
  }

  const root = document.createElement('article');
  root.dataset.codexPage = page.id;
  root.style.cssText = 'min-width:0;display:flex;flex-direction:column;gap:14px;color:#f8f1df;';

  const figure = document.createElement('figure');
  figure.style.cssText = 'margin:0;display:grid;gap:6px;';
  const image = document.createElement('img');
  image.src = page.image.src;
  image.alt = page.image.alt;
  image.style.cssText = 'width:100%;max-height:280px;object-fit:cover;border-radius:8px;border:1px solid rgba(232,193,112,0.26);background:#0b0f16;';
  figure.appendChild(image);
  const caption = document.createElement('figcaption');
  caption.style.cssText = 'font-size:11px;line-height:1.35;color:rgba(248,241,223,0.62);';
  const credit = document.createElement('a');
  credit.href = page.image.sourceUrl;
  credit.target = '_blank';
  credit.rel = 'noopener noreferrer';
  credit.textContent = `${page.image.attribution} - ${page.image.license}`;
  credit.style.cssText = 'color:inherit;text-decoration:underline;text-decoration-color:rgba(232,193,112,0.45);';
  caption.appendChild(credit);
  figure.appendChild(caption);
  root.appendChild(figure);

  const hero = document.createElement('div');
  hero.style.cssText = 'display:flex;gap:14px;align-items:center;flex-wrap:wrap;';
  vignetteHost = document.createElement('div');
  vignetteHost.dataset.codexSpectacleHost = 'true';
  vignetteHost.appendChild(renderVignette());
  hero.appendChild(vignetteHost);
  const copy = document.createElement('div');
  copy.style.cssText = 'min-width:0;flex:1;';
  appendText(copy, 'p', page.stateLabel, 'margin:0 0 3px;font-size:12px;color:#e8c170;');
  appendText(copy, 'h3', page.title, 'margin:0;font-size:24px;letter-spacing:0;');
  appendText(copy, 'p', page.subtitle, 'margin:5px 0 0;font-size:13px;line-height:1.45;color:rgba(248,241,223,0.74);');
  if (page.kind === 'natural') {
    const replay = createGameButton('Replay animation', 'ghost');
    replay.dataset.codexReplayAnimation = 'true';
    replay.setAttribute('aria-label', `Replay ${page.title} animation`);
    replay.addEventListener('click', () => {
      if (reducedMotion || !vignetteHost) return;
      if (replayTimer !== null) {
        window.clearTimeout(replayTimer);
      }
      codexSpectacleMode = 'reveal-amplified';
      vignetteHost.textContent = '';
      vignetteHost.appendChild(renderVignette());
      replayTimer = window.setTimeout(() => {
        if (!vignetteHost) return;
        codexSpectacleMode = 'codex-ambient';
        vignetteHost.textContent = '';
        vignetteHost.appendChild(renderVignette());
        replayTimer = null;
      }, 3600);
    });
    copy.appendChild(replay);
  }
  hero.appendChild(copy);
  root.appendChild(hero);

  appendText(root, 'p', page.authoredLead, 'margin:0;font-size:15px;line-height:1.55;');
  appendText(root, 'p', page.learningText, 'margin:0;font-size:13px;line-height:1.55;color:rgba(248,241,223,0.78);');

  const status = document.createElement('ul');
  status.style.cssText = 'margin:0;padding-left:18px;display:grid;gap:4px;font-size:12px;color:rgba(248,241,223,0.76);';
  for (const line of page.statusLines) appendText(status, 'li', line);
  root.appendChild(status);

  if (page.actions.length > 0) {
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
    for (const action of page.actions) {
      const button = createGameButton(action.label, 'secondary');
      button.dataset.codexAction = action.type === 'view-map' ? 'view-map' : 'open-city';
      button.addEventListener('click', () => options.onAction(action));
      actions.appendChild(button);
    }
    root.appendChild(actions);
  }

  root.appendChild(createSectionList(page, mode));

  if (page.relatedEntries.length > 0) {
    const related = document.createElement('nav');
    related.style.cssText = 'border-top:1px solid rgba(255,255,255,0.12);padding-top:10px;';
    appendText(related, 'h4', 'Related', 'margin:0 0 8px;font-size:13px;color:#f4d188;');
    const list = document.createElement('div');
    list.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
    for (const entry of page.relatedEntries) {
      const button = createGameButton(entry.title, 'ghost');
      button.dataset.codexRelated = entry.id;
      button.addEventListener('click', () => options.onSelectRelated(entry.id));
      list.appendChild(button);
    }
    related.appendChild(list);
    root.appendChild(related);
  }

  return root;
}
