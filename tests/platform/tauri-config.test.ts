import { describe, expect, it } from 'vitest';
import tauriConfig from '../../src-tauri/tauri.conf.json';

describe('tauri config', () => {
  it('runs frontend commands without requiring mise on CI runners', () => {
    expect(tauriConfig.build.beforeDevCommand.script).toBe('yarn dev --host 127.0.0.1');
    expect(tauriConfig.build.beforeBuildCommand.script).toBe('yarn build:tauri');
    expect(tauriConfig.build.beforeDevCommand.script).not.toContain('run-with-mise');
    expect(tauriConfig.build.beforeBuildCommand.script).not.toContain('run-with-mise');
  });
});
