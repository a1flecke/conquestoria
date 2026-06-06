import type { WonderVideoPreviewView } from '@/systems/wonder-codex/video-presentation';
import { createGameButton } from '@/ui/ui-kit';

export interface WonderVideoViewOptions {
  preview: WonderVideoPreviewView;
  reducedMotion?: boolean;
  autoplay?: 'in-view' | 'immediate';
}

function createAttributionLink(label: string, sourceUrl: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = sourceUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = label;
  Object.assign(link.style, {
    color: 'rgba(232,193,112,0.95)',
    textDecoration: 'underline',
  });
  return link;
}

function styleRoot(root: HTMLElement): void {
  Object.assign(root.style, {
    margin: '0',
    width: '100%',
    display: 'grid',
    gap: '8px',
  });
}

function renderFallback(root: HTMLElement, preview: WonderVideoPreviewView): void {
  root.replaceChildren();
  root.dataset.wonderVideoState = 'fallback';

  const image = document.createElement('img');
  image.src = preview.fallbackImage.src;
  image.alt = preview.fallbackImage.alt;
  Object.assign(image.style, {
    width: '100%',
    height: '100%',
    minHeight: '148px',
    objectFit: 'cover',
    borderRadius: '8px',
    border: '1px solid rgba(232,193,112,0.25)',
    background: 'rgba(0,0,0,0.2)',
  });

  const caption = document.createElement('figcaption');
  caption.textContent = `${preview.fallbackImage.attribution} - ${preview.fallbackImage.license} - `;
  caption.append(createAttributionLink('source', preview.fallbackImage.sourceUrl));
  Object.assign(caption.style, {
    color: 'rgba(244,241,232,0.68)',
    fontSize: '11px',
    lineHeight: '1.35',
  });

  root.append(image, caption);
}

export function createWonderVideoView(options: WonderVideoViewOptions): HTMLElement {
  const { preview, reducedMotion = false, autoplay = 'in-view' } = options;
  const root = document.createElement('figure');
  root.dataset.wonderVideoView = preview.id;
  root.dataset.wonderVideoSurface = preview.surface;
  styleRoot(root);

  if (reducedMotion) {
    renderFallback(root, preview);
    return root;
  }

  root.dataset.wonderVideoState = 'paused';

  const video = document.createElement('video');
  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.setAttribute('aria-label', `${preview.label} video preview`);
  Object.assign(video.style, {
    width: '100%',
    height: '100%',
    minHeight: '148px',
    objectFit: 'cover',
    borderRadius: '8px',
    border: '1px solid rgba(232,193,112,0.25)',
    background: 'rgba(0,0,0,0.2)',
  });

  const source = document.createElement('source');
  source.src = preview.src;
  source.type = preview.mimeType;
  video.append(source);

  const controls = document.createElement('div');
  Object.assign(controls.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    flexWrap: 'wrap',
  });

  const toggle = createGameButton('Play', 'ghost');
  toggle.dataset.wonderVideoToggle = 'true';

  const attribution = document.createElement('span');
  attribution.textContent = `${preview.attribution} - ${preview.license} - `;
  attribution.append(createAttributionLink('source', preview.sourceUrl));
  Object.assign(attribution.style, {
    color: 'rgba(244,241,232,0.68)',
    fontSize: '11px',
    lineHeight: '1.35',
  });

  controls.append(toggle, attribution);

  let observer: IntersectionObserver | null = null;

  const setPaused = (): void => {
    root.dataset.wonderVideoState = 'paused';
    toggle.textContent = 'Play';
  };

  const setPlaying = (): void => {
    root.dataset.wonderVideoState = 'playing';
    toggle.textContent = 'Pause';
  };

  const pauseVideo = (): void => {
    video.pause();
    setPaused();
  };

  const playVideo = (): void => {
    setPlaying();
    const result = video.play();
    if (result && typeof result.catch === 'function') {
      result.catch(() => setPaused());
    }
  };

  video.addEventListener('error', () => {
    observer?.disconnect();
    renderFallback(root, preview);
  });

  toggle.addEventListener('click', () => {
    if (root.dataset.wonderVideoState === 'playing') {
      pauseVideo();
      return;
    }
    playVideo();
  });

  root.append(video, controls);

  if (autoplay === 'immediate') {
    playVideo();
  } else if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(entries => {
      const isVisible = entries.some(entry => entry.isIntersecting);
      if (isVisible) playVideo();
      else if (root.dataset.wonderVideoState === 'playing') pauseVideo();
    });
    observer.observe(root);
  }

  return root;
}
