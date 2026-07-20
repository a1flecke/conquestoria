/**
 * Mirrors Appendix A in docs/superpowers/specs/2026-04-08-m4e-the-council-design.md.
 * Update this module in the same branch whenever the appendix changes.
 */
export function getApprovedM4LegendaryWonderRoster(): ReadonlyArray<{ id: string; name: string }> {
  return [
    // Era 1-2 wonders (Dawn Age) — MR11: fills the previously-empty opening-era wonder race.
    { id: 'standing-stones', name: 'The Standing Stones' },
    { id: 'great-pyramid', name: 'Great Pyramid' },
    { id: 'tidemother-colossus', name: 'Tidemother Colossus' },
    // Era 3-4 wonders. NOTE: era 4 alone carries 11 wonders (an audit-flagged glut —
    // see the content-audit doc for the redistribution option). Not rebalanced in
    // MR11 — re-costing 11 wonders' worth of eligibility windows is out of scope here.
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
    // Era 8 wonders (Nationalist Era)
    { id: 'eiffel-tower', name: 'Eiffel Tower' },
    { id: 'brooklyn-bridge', name: 'Brooklyn Bridge' },
    { id: 'trans-siberian-railway', name: 'Trans-Siberian Railway' },
    { id: 'panama-canal', name: 'Panama Canal' },
    { id: 'empire-state-building', name: 'Empire State Building' },
    { id: 'hoover-dam', name: 'Hoover Dam' },
    { id: 'wright-flyer', name: 'Wright Flyer' },
    // Era 10 wonders (World War & Cold War)
    { id: 'united-nations', name: 'United Nations' },
    // Era 11 wonders (Space Race & Détente)
    { id: 'apollo-program', name: 'Apollo Program' },
    // Era 13 wonders (Autonomous Systems)
    { id: 'open-intelligence-commons', name: 'Open Intelligence Commons' },
    { id: 'lunar-gateway', name: 'Lunar Gateway' },
  ] as const;
}
