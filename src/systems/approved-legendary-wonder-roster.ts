/**
 * Mirrors Appendix A in docs/superpowers/specs/2026-04-08-m4e-the-council-design.md.
 * Update this module in the same branch whenever the appendix changes.
 */
export function getApprovedM4LegendaryWonderRoster(): ReadonlyArray<{ id: string; name: string }> {
  return [
    { id: 'oracle-of-delphi', name: 'Oracle of Delphi' },
    { id: 'grand-canal', name: 'Grand Canal' },
    { id: 'sun-spire', name: 'Sun Spire' },
    { id: 'world-archive', name: 'World Archive' },
    { id: 'moonwell-gardens', name: 'Moonwell Gardens' },
    { id: 'ironroot-foundry', name: 'Ironroot Foundry' },
    { id: 'tidecaller-bastion', name: 'Tidecaller Bastion' },
    { id: 'starvault-observatory', name: 'Starvault Observatory' },
    { id: 'whispering-exchange', name: 'Whispering Exchange' },
    { id: 'hall-of-champions', name: 'Hall of Champions' },
    { id: 'gate-of-the-world', name: 'Gate of the World' },
    { id: 'leviathan-drydock', name: 'Leviathan Drydock' },
    { id: 'storm-signal-spire', name: 'Storm-Signal Spire' },
    { id: 'manhattan-project', name: 'Manhattan Project' },
    { id: 'internet', name: 'Internet' },
    // Era 5 wonders (Renaissance)
    { id: 'sistine-vault', name: 'Sistine Vault' },
    { id: 'codex-eternal', name: 'Codex Eternal' },
    { id: 'navigators-compass', name: "Navigator's Compass" },
    // Era 6 wonders (Gunpowder Age)
    { id: 'palace-of-the-sun', name: 'Palace of the Sun' },
    { id: 'iron-arsenal', name: 'Iron Arsenal' },
    { id: 'merchant-admiralty', name: 'Merchant Admiralty' },
    // Era 7 wonders (Industrial Revolution)
    { id: 'crystal-palace', name: 'Crystal Palace' },
    { id: 'suez-canal', name: 'Suez Canal' },
    { id: 'continental-congress', name: 'Continental Congress' },
  ] as const;
}
