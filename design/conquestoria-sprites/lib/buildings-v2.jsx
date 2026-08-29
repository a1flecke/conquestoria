/* buildings-v2.jsx — v2 wrappers for all 23 building sprites.
 *
 * BuildingFrameV2 is the building equivalent of SpriteFrameV2: it adds
 * cq-v2 class + auto-phase --phase to the wrapper div. That's the ONLY
 * addition — v1 building animations (smoke, fire, glow, banners) are
 * intentional and not overridden by the v2 CSS when data-kind="building".
 *
 * Do NOT add new building class hooks without flagging to designer.
 */

function BuildingFrameV2({ state = 'idle', phase, children }) {
  const autoPhase = React.useMemo(() => Math.random(), []);
  /* Use strict undefined check: `phase={0}` is a legitimate caller intent
   * (the serializer's deterministic-output request) and must not fall
   * through to autoPhase. Only an *omitted* prop triggers the auto value.
   * Mirrors SpriteFrameV2's contract in units-v2.jsx. */
  const p = phase === undefined ? autoPhase : phase;
  return (
    <div className="cq-sprite-wrap cq-v2" data-state={state} data-kind="building"
         style={{ '--phase': p }}>
      {children}
    </div>
  );
}

/* Each wrapper passes through to the v1 sprite, adding only auto-phase. */

function GranaryV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><GranarySprite faction={faction} state={state} /></BuildingFrameV2>;
}
function HerbalistV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><HerbalistSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function AqueductV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><AqueductSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function WorkshopV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><WorkshopSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function ForgeV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><ForgeSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function LumbermillV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><LumbermillSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function QuarryV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><QuarrySprite faction={faction} state={state} /></BuildingFrameV2>;
}
function LibraryV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><LibrarySprite faction={faction} state={state} /></BuildingFrameV2>;
}
function ArchiveV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><ArchiveSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function ObservatoryV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><ObservatorySprite faction={faction} state={state} /></BuildingFrameV2>;
}
function MarketplaceV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><MarketplaceSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function HarborV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><HarborSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function BarracksV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><BarracksSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function WallsV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><WallsSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function StableV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><StableSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function TempleV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><TempleSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function MonumentV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><MonumentSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function AmphitheaterV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><AmphitheaterSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function ShrineV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><ShrineSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function ForumV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><ForumSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function SafehouseV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><SafehouseSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function IntelAgencyV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><IntelAgencySprite faction={faction} state={state} /></BuildingFrameV2>;
}
function SecurityBureauV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><SecurityBureauSprite faction={faction} state={state} /></BuildingFrameV2>;
}

/* === MR 3: 12 new building wrappers === */

function DockV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><DockSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function BronzeWorkshopV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><BronzeWorkshopSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function ArmoryV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><ArmorySprite faction={faction} state={state} /></BuildingFrameV2>;
}
function RanchV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><RanchSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function CavalryAcademyV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><CavalryAcademySprite faction={faction} state={state} /></BuildingFrameV2>;
}
function IronFoundryV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><IronFoundrySprite faction={faction} state={state} /></BuildingFrameV2>;
}
function WarAcademyV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><WarAcademySprite faction={faction} state={state} /></BuildingFrameV2>;
}
function MasonryWorksV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><MasonryWorksSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function SiegeWorkshopV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><SiegeWorkshopSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function CaravanseraiV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><CaravanseraiSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function BankV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><BankSprite faction={faction} state={state} /></BuildingFrameV2>;
}
function StockExchangeV2Sprite({ faction = 'imperials', state = 'idle', phase }) {
  return <BuildingFrameV2 state={state} phase={phase}><StockExchangeSprite faction={faction} state={state} /></BuildingFrameV2>;
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
  DockV2Sprite, BronzeWorkshopV2Sprite, ArmoryV2Sprite, RanchV2Sprite,
  CavalryAcademyV2Sprite, IronFoundryV2Sprite, WarAcademyV2Sprite, MasonryWorksV2Sprite,
  SiegeWorkshopV2Sprite, CaravanseraiV2Sprite, BankV2Sprite, StockExchangeV2Sprite,
});
