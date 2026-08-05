// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createPanelRouter } from '@/app/panel-router';
import { createPanelHost } from '@/app/panel-host';

const stubPanel = (layer: HTMLElement, id: string) => () => {
  layer.appendChild(Object.assign(document.createElement('div'), { id }));
};

describe('panel router', () => {
  it('opening a main-group panel closes the previously open one', () => {
    const layer = document.createElement('div');
    const host = createPanelHost(layer);
    const openTech = vi.fn(stubPanel(layer, 'tech-panel'));
    const openCouncil = vi.fn(stubPanel(layer, 'council-panel'));

    const router = createPanelRouter({
      host,
      registry: {
        tech: { domId: 'tech-panel', group: 'main', open: openTech },
        council: { domId: 'council-panel', group: 'main', open: openCouncil },
      },
      context: {} as never,
    });

    router.open('tech');
    router.open('council');

    expect(layer.querySelector('#tech-panel')).toBeNull();
    expect(layer.querySelector('#council-panel')).not.toBeNull();
    expect(router.isOpen('tech')).toBe(false);
    expect(router.isOpen('council')).toBe(true);
  });

  it('a transient panel does not close a main panel', () => {
    const layer = document.createElement('div');
    const host = createPanelHost(layer);
    const router = createPanelRouter({
      host,
      registry: {
        tech: { domId: 'tech-panel', group: 'main', open: stubPanel(layer, 'tech-panel') },
        'territory-inspection': { domId: 'territory-panel', group: 'transient', open: stubPanel(layer, 'territory-panel') },
      },
      context: {} as never,
    });

    router.open('tech');
    router.open('territory-inspection');

    expect(layer.querySelector('#tech-panel')).not.toBeNull();
    expect(layer.querySelector('#territory-panel')).not.toBeNull();
  });

  it('two transient panels coexist -- opening one does not close the other', () => {
    const layer = document.createElement('div');
    const host = createPanelHost(layer);
    const router = createPanelRouter({
      host,
      registry: {
        'wonder-atlas': { domId: 'wonder-codex-panel', group: 'transient', open: stubPanel(layer, 'wonder-codex-panel') },
        'notification-log': { domId: 'notification-log', group: 'transient', open: stubPanel(layer, 'notification-log') },
      },
      context: {} as never,
    });

    router.open('notification-log');
    router.open('wonder-atlas');

    expect(layer.querySelector('#notification-log')).not.toBeNull();
    expect(layer.querySelector('#wonder-codex-panel')).not.toBeNull();
  });

  it('closeGroup only removes panels in that group', () => {
    const layer = document.createElement('div');
    const host = createPanelHost(layer);
    const router = createPanelRouter({
      host,
      registry: {
        tech: { domId: 'tech-panel', group: 'main', open: stubPanel(layer, 'tech-panel') },
        bestiary: { domId: 'bestiary-panel', group: 'transient', open: stubPanel(layer, 'bestiary-panel') },
      },
      context: {} as never,
    });

    router.open('tech');
    router.open('bestiary');
    router.closeGroup('transient');

    expect(layer.querySelector('#tech-panel')).not.toBeNull();
    expect(layer.querySelector('#bestiary-panel')).toBeNull();
  });

  it('toggle closes an already-open panel instead of reopening it', () => {
    const layer = document.createElement('div');
    const host = createPanelHost(layer);
    const open = vi.fn(stubPanel(layer, 'tech-panel'));
    const router = createPanelRouter({
      host,
      registry: { tech: { domId: 'tech-panel', group: 'main', open } },
      context: {} as never,
    });

    router.toggle('tech');
    router.toggle('tech');

    expect(layer.querySelector('#tech-panel')).toBeNull();
    expect(open).toHaveBeenCalledTimes(1);
  });
});
