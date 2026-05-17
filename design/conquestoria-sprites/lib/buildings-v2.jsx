/* buildings-v2.jsx — v2 wrappers for all 23 building sprites.
 *
 * BuildingFrameV2 is the building equivalent of SpriteFrameV2: it adds
 * cq-v2 class + auto-phase --phase to the wrapper div. That's the ONLY
 * addition — v1 building animations (smoke, fire, glow, banners) are
 * intentional and not overridden by the v2 CSS when data-kind="building".
 *
 * Do NOT add new building class hooks without flagging to designer.
 */

function BuildingFrameV2({ state = 'idle', children }) {
  const autoPhase = React.useMemo(() => Math.random(), []);
  return (
    <div className="cq-sprite-wrap cq-v2" data-state={state} data-kind="building"
         style={{ '--phase': autoPhase }}>
      {children}
    </div>
  );
}

/* Each wrapper passes through to the v1 sprite, adding only auto-phase. */

function GranaryV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><GranarySprite faction={faction} state={state} /></BuildingFrameV2>;
}
function HerbalistV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><HerbalistSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function AqueductV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><AqueductSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function WorkshopV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><WorkshopSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function ForgeV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><ForgeSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function LumbermillV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><LumbermillSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function QuarryV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><QuarrySprite faction={faction} state={state} /></BuildingFrameV2>;
}
function LibraryV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><LibrarySprite faction={faction} state={state} /></BuildingFrameV2>;
}
function ArchiveV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><ArchiveSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function ObservatoryV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><ObservatorySprite faction={faction} state={state} /></BuildingFrameV2>;
}
function MarketplaceV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><MarketplaceSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function HarborV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><HarborSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function BarracksV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><BarracksSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function WallsV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><WallsSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function StableV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><StableSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function TempleV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><TempleSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function MonumentV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><MonumentSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function AmphitheaterV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><AmphitheaterSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function ShrineV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><ShrineSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function ForumV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><ForumSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function SafehouseV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><SafehouseSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function IntelAgencyV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><IntelAgencySprite faction={faction} state={state} /></BuildingFrameV2>;
}
function SecurityBureauV2Sprite({ faction = 'imperials', state = 'idle' }) {
  return <BuildingFrameV2 state={state}><SecurityBureauSprite faction={faction} state={state} /></BuildingFrameV2>;
}

Object.assign(window, {
  BuildingFrameV2,
  GranaryV2Sprite, HerbalistV2Sprite, AqueductV2Sprite,
  WorkshopV2Sprite, ForgeV2Sprite, LumbermillV2Sprite, QuarryV2Sprite,
  LibraryV2Sprite, ArchiveV2Sprite, ObservatoryV2Sprite,
  MarketplaceV2Sprite, HarborV2Sprite,
  BarracksV2Sprite, WallsV2Sprite, StableV2Sprite,
  TempleV2Sprite, MonumentV2Sprite, AmphitheaterV2Sprite, ShrineV2Sprite, ForumV2Sprite,
  SafehouseV2Sprite, IntelAgencyV2Sprite, SecurityBureauV2Sprite,
});
