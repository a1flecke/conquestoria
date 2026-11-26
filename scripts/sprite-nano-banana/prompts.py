#!/usr/bin/env python3
"""Single-image prompt builder for the Nano Banana sprite production pipeline.

Reads the canonical family templates in `scripts/sprite-puppet/strip-prompts/{master,set}.md` so
the ChatGPT pipeline and the Nano Banana pipeline never drift apart, then wraps each sheet as an
independent single-image generation prompt (the Warrior/Swordsman breakthrough from STRIPS.md)
with Nano Banana-specific flat-magenta framing, style-reference anchoring, era/theme guidance,
and automated diagnostic retry instructions.
"""
from __future__ import annotations

import importlib.util
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

REPO = Path(__file__).resolve().parents[2]
PROMPT_DIR = REPO / 'scripts' / 'sprite-puppet' / 'strip-prompts'

# Map strip state names to the heading used in strip-prompts/set.md.
STATE_TO_SET_HEADING: dict[str, str] = {
    'damage': 'DAMAGE',
    'attack': 'ATTACK',
    'hit': 'HIT REACTION',
    'defeat': 'DEFEAT',
    'wreck': 'WRECK',
    'sinking': 'SINKING',
    'down': 'GOING DOWN',
    'work': 'WORK',
}

MASTER_ASPECT_BY_FAMILY: dict[str, str] = {
    'biped': '3:4',
    'mounted': '1:1',
    'vehicle': '4:3',
    'aircraft': '4:3',
    'naval': '16:9',
}

NANO_BANANA_MAGENTA_RULE = (
    'BACKGROUND: one completely flat, uniform solid pure magenta (#FF00FF) background filling the '
    'entire image behind the unit. NO transparency checkerboard, NO grey-and-white grid, NO gradient, '
    'NO drop shadow, NO ambient glow, NO vignette, NO soft semi-transparent edges. Every outline, '
    'smoke puff, flame, dust cloud, or effect must be 100% solid, opaque, and hard-edged with a '
    'clean dark ink outline against the #FF00FF magenta so nothing blends into purple. Put nothing '
    'magenta, pink, or purple anywhere on the unit.'
)

STYLE_REFERENCE_PREAMBLE = (
    'STYLE REFERENCE (attached image): The attached image is an already-approved unit from the SAME '
    'game ({ref_id}). Match ONLY its hand-painted 2D art style, bold dark ink outline weight, flat '
    'cel shading with soft highlights, earthy colour richness, silhouette readability at 48 pixels, '
    'flat #FF00FF magenta background, and saturated pure-red (#E01010) team-colour convention. '
    'DO NOT copy that character, silhouette, outfit, weapon, mount, or vehicle — draw a completely '
    'different unit matching the specification below.'
)

SHEET_RULES_BLOCK = (
    'MANDATORY RULES FOR THIS SHEET:\n'
    '- Authoritative reference: match the attached master image EXACTLY ({identity}). Same art style, '
    'bold dark outline, flat cel shading, palette, lighting, proportions, headgear, face, and held '
    'items in every frame. Do not redesign anything.\n'
    '- Strict side view facing RIGHT, identical scale across every frame. Do NOT zoom in on a '
    'crouching, kneeling, or fallen pose.\n'
    '- Leave clear empty #FF00FF magenta space (at least 20% of a figure width) between every pair '
    'of neighbouring figures and around all four outer edges of the image. No figure touches another '
    'figure or the image border.\n'
    '- Nothing detached from a figure: no floating arrows, bullets, sparks, dust clouds, debris, '
    'motion arcs, or disconnected smoke puffs. Every weapon, shield, flame, or smoke wisp stays '
    'physically connected to the figure.\n'
    '- ' + NANO_BANANA_MAGENTA_RULE + '\n'
    '- Paint {team_area} saturated pure red (#E01010), exactly as in the master; it is the ONLY '
    'bright red anywhere in the image. Wounds, stains, rust, and fire are dark maroon, brown, grey, '
    'yellow-orange, or black — never bright red. Family-friendly, no blood and no gore.\n'
    '- No text, labels, numbers, boxes, borders, grid lines, ground planes, or shadows.\n'
    '- Do NOT draw a walk, run, gallop, rolling, or flying cycle; the game animates movement itself.'
)


@dataclass(frozen=True)
class SheetJob:
    """One image to generate for a unit spec."""
    file_key: str        # 'a', 'b', 'c', ...
    state: str           # 'idle', 'damage', 'attack', 'hit', 'defeat', 'wreck', 'sinking', 'down', 'work'
    role_label: str      # human-readable provenance role
    cells: int
    grid: list[int] | None
    aspect_ratio: str
    is_master: bool
    state_spec: dict


def _load_strips():
    path = REPO / 'scripts' / 'sprite-puppet' / 'strips.py'
    name = '_nb_strips'
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def _fill_placeholders(template: str, fields: dict[str, str]) -> tuple[str, list[str]]:
    text = template
    for _ in range(4):
        text = re.sub(r'\{\{(\w+)\}\}', lambda m: fields.get(m.group(1), m.group(0)), text)
    missing = list(dict.fromkeys(re.findall(r'\{\{(\w+)\}\}', text)))
    return text, missing


def _parse_numbered_items(images_block: str) -> dict[str, str]:
    """Parse '1. DAMAGE (...): ...' items from set.md's family images section by uppercase heading."""
    items: dict[str, str] = {}
    matches = list(re.finditer(r'(?m)^\d+\.\s+([A-Z][A-Z ]+?)\s*\(', images_block))
    for i, m in enumerate(matches):
        heading = m.group(1).strip()
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(images_block)
        chunk = images_block[start:end].strip()
        # Drop the leading '1. ' number so the single-image prompt never implies multiple images.
        chunk = re.sub(r'^\d+\.\s+', '', chunk)
        items[heading] = chunk
    return items


def aspect_ratio_for_state(spec: dict, state_spec: dict, is_master: bool) -> str:
    """Choose the best Nano Banana aspect ratio for a master or multi-frame action sheet."""
    explicit = state_spec.get('aspectRatio')
    if isinstance(explicit, str) and explicit.strip():
        return explicit.strip()
    family = spec.get('family', 'biped')
    if is_master or state_spec.get('cells', 1) == 1:
        return MASTER_ASPECT_BY_FAMILY.get(family, '1:1')
    grid = state_spec.get('grid')
    cells = int(state_spec.get('cells', 1))
    if grid:
        rows = len(grid)
        max_cols = max(grid)
        if rows == 2 and max_cols == 2:
            return '1:1'
        if rows == 2 and max_cols == 3:
            return '3:2'
        if rows == 1:
            return '16:9'
        return '3:2' if max_cols > rows else '1:1'
    if cells >= 3:
        return '16:9'
    return '3:2'


def _role_label(state_spec: dict, is_master: bool) -> str:
    state = state_spec['state']
    cells = int(state_spec.get('cells', 1))
    grid = state_spec.get('grid')
    if is_master:
        return 'idle (master)'
    if state == 'damage':
        return 'damage tiers 0-3 (2 x 2 grid)'
    if grid:
        grid_desc = ' + '.join(str(g) for g in grid) if len(set(grid)) > 1 else f'{grid[0]} x {len(grid)} grid'
        return f'{state}, {cells} frames ({grid_desc})'
    return f'{state}, {cells} frames (1 x {cells} row)'


def list_sheet_jobs(spec: dict) -> list[SheetJob]:
    """Return all drawn source-image jobs for `spec` in canonical production order (master, damage, rest)."""
    seen: set[str] = set()
    raw_jobs: list[SheetJob] = []
    for idx, st in enumerate(spec.get('states', [])):
        fkey = st.get('file')
        if not fkey or fkey in seen:
            continue
        seen.add(fkey)
        is_master = idx == 0 or st.get('state') == 'idle'
        raw_jobs.append(SheetJob(
            file_key=fkey,
            state=st['state'],
            role_label=_role_label(st, is_master),
            cells=int(st['cells']),
            grid=list(st['grid']) if st.get('grid') else None,
            aspect_ratio=aspect_ratio_for_state(spec, st, is_master),
            is_master=is_master,
            state_spec=st,
        ))
    # Enforce STRIPS.md order of work: master first, damage second, then all remaining one-shot actions.
    def _priority(job: SheetJob) -> tuple[int, int]:
        if job.is_master:
            return (0, 0)
        if job.state == 'damage':
            return (1, 0)
        return (2, raw_jobs.index(job))

    return sorted(raw_jobs, key=_priority)


def _filled_family_sections(spec: dict, template_dir: Path = PROMPT_DIR) -> tuple[str, dict[str, str], dict[str, str]]:
    strips = _load_strips()
    master_body, master_families = strips.template_parts(template_dir / 'master.md')
    set_body, set_families = strips.template_parts(template_dir / 'set.md')
    families = sorted(set(master_families) & set(set_families))
    family = spec.get('family')
    if family not in families:
        raise ValueError(f'unknown family "{family}": choose one of {", ".join(families)}')

    values = {**strips.OPTIONAL_PROMPT_KEYS, **{k: str(v) for k, v in (spec.get('prompt') or {}).items()}}
    master_fields = {**master_families[family], **values}
    set_fields = {**set_families[family], **values}

    master_text, missing_m = _fill_placeholders(master_body, master_fields)
    set_text, missing_s = _fill_placeholders(set_body, set_fields)
    missing = list(dict.fromkeys(missing_m + missing_s))
    if missing:
        raise ValueError('the spec is missing ' + ', '.join(f'prompt.{k}' for k in missing))

    images_text, _ = _fill_placeholders(set_families[family].get('images', ''), set_fields)
    return master_text, _parse_numbered_items(images_text), set_fields


def build_master_prompt(
    spec: dict,
    *,
    template_dir: Path = PROMPT_DIR,
    style_ref_id: str | None = None,
    theme_note: str | None = None,
    extra_feedback: str | None = None,
) -> str:
    """Build the Nano Banana prompt for the master (`a.png`) drawing."""
    master_text, _, fields = _filled_family_sections(spec, template_dir)
    # Replace the ChatGPT transparent-first background rule with Nano Banana's crisp flat-magenta rule.
    master_text = re.sub(
        r'BACKGROUND:.*?(?=\n\nTEAM COLOUR:)',
        NANO_BANANA_MAGENTA_RULE,
        master_text,
        flags=re.S,
    )
    # Drop the ChatGPT conversational checklist footer so Nano Banana focuses purely on clean image output.
    master_text = re.sub(
        r'\nDraw the image now\. Then answer with one short line.*$',
        '\nGenerate the image now with crisp opaque edges on flat solid #FF00FF magenta.',
        master_text,
        flags=re.S,
    )

    sections: list[str] = []
    if style_ref_id:
        sections.append(STYLE_REFERENCE_PREAMBLE.format(ref_id=style_ref_id))

    resolved_theme = (theme_note or (spec.get('prompt') or {}).get('theme') or '').strip()
    if resolved_theme:
        sections.append(f'ERA / VISUAL THEME: {resolved_theme}')

    sections.append(master_text.strip())

    if extra_feedback and extra_feedback.strip():
        sections.append('REQUIRED CORRECTIONS FROM PREVIOUS ATTEMPT (fix every item):\n' + extra_feedback.strip())

    return '\n\n'.join(sections)


def _describe_custom_state(spec: dict, job: SheetJob, fields: dict[str, str]) -> str:
    st = job.state_spec
    if st.get('prompt'):
        return str(st['prompt'])
    prompt_block = spec.get('prompt') or {}
    if job.state in prompt_block:
        desc = str(prompt_block[job.state])
    elif st.get('note'):
        desc = str(st['note'])
    else:
        desc = f'{job.state} animation poses for {fields["name"]}'
    layout = (
        f'a grid of {" then ".join(str(g) for g in job.grid)}'
        if job.grid
        else f'exactly ONE horizontal row of {job.cells} frames left to right (not a grid, not a column)'
    )
    return f'{job.state.upper()} ({job.cells} frames, {layout}): {desc}'


def build_sheet_prompt(
    spec: dict,
    job: SheetJob,
    *,
    template_dir: Path = PROMPT_DIR,
    theme_note: str | None = None,
    extra_feedback: str | None = None,
) -> str:
    """Build a self-contained single-image Nano Banana prompt for one action/damage sheet (`b..e`)."""
    _, items, fields = _filled_family_sections(spec, template_dir)
    heading = STATE_TO_SET_HEADING.get(job.state)
    item_text = items.get(heading) if heading else None
    if not item_text:
        item_text = _describe_custom_state(spec, job, fields)

    family = spec.get('family', 'biped')
    extra_rules: list[str] = []
    if job.state in ('wreck', 'sinking', 'down'):
        extra_rules.append(
            '- CRITICAL FOR SMOKE & FLAMES: draw all fire, explosions, and smoke as SOLID, OPAQUE, '
            'hard-edged cel-shaded shapes with crisp dark outlines against the #FF00FF magenta '
            'background. Never use soft semi-transparent airbrush smoke or feathered glow that mixes '
            'with magenta into a purple halo.'
        )
    if job.state == 'damage' and family in ('biped', 'mounted'):
        extra_rules.append(
            '- CRITICAL FOR WALK RIGGING: keep every leg and foot/hoof in the EXACT position of the '
            'master with a clear solid #FF00FF magenta gap between every pair of legs in ALL 4 frames. '
            'Mud, bandages, weapons, or torn cloth must never bridge or touch across the leg gap.'
        )
    if job.state == 'hit':
        extra_rules.append(
            '- This is a NEW and DIFFERENT image from the attack sheet: draw ONLY the HIT REACTION '
            'frames (recoiling from an incoming blow), NOT an attack.'
        )
    if job.state == 'defeat':
        extra_rules.append(
            '- This is a NEW and DIFFERENT image from attack and hit: draw ONLY the non-graphic '
            'DEFEAT / collapse sequence ending at rest, with all gear still touching the figure.'
        )

    resolved_theme = (theme_note or (spec.get('prompt') or {}).get('theme') or '').strip()
    parts = [
        f'Draw ONE image: the {job.state.upper()} sprite sheet for {fields["name"]}.',
        'The attached image is the APPROVED MASTER design of this unit. It is the sole authoritative reference.',
    ]
    if resolved_theme:
        parts.append(f'ERA / VISUAL THEME: {resolved_theme}')
    parts.append(f'WHAT TO DRAW:\n{item_text}')
    parts.append(
        SHEET_RULES_BLOCK.format(identity=fields['identity'], team_area=fields['team_area'])
        + ('\n' + '\n'.join(extra_rules) if extra_rules else '')
    )
    if extra_feedback and extra_feedback.strip():
        parts.append('REQUIRED CORRECTIONS FROM PREVIOUS ATTEMPT (fix every item):\n' + extra_feedback.strip())
    parts.append('Generate this single sprite sheet image now on flat solid #FF00FF magenta.')
    return '\n\n'.join(parts)


def build_retry_feedback(
    issues: Iterable[tuple[str, str]],
    job: SheetJob,
    family: str,
    owner_note: str | None = None,
) -> str:
    """Convert QC issue `(code, message)` pairs + optional owner feedback into retry instructions."""
    lines: list[str] = []
    seen_codes: set[str] = set()
    for code, message in issues:
        if code in seen_codes:
            continue
        seen_codes.add(code)
        if code == 'background':
            lines.append(
                '- The background was not flat solid #FF00FF magenta (it looked white, grey, textured, '
                'or like a checkerboard). Fill the ENTIRE background with one flat, uniform #FF00FF magenta.'
            )
        elif code == 'count':
            layout = (
                f'grid {" + ".join(str(g) for g in job.grid)}'
                if job.grid
                else f'one horizontal row of {job.cells} figures'
            )
            lines.append(
                f'- Wrong number of separated figures ({message}). Draw EXACTLY {job.cells} clearly '
                f'separated figures arranged in {layout}, with generous empty #FF00FF magenta space '
                'between every figure so none touch.'
            )
        elif code == 'leftover':
            lines.append(
                f'- Detached floating pieces were detected ({message}). Do NOT draw floating arrows, '
                'sparks, dust puffs, rocks, debris, or separate weapons; keep every item attached to its figure.'
            )
        elif code == 'edge':
            lines.append(
                '- At least one figure touched the edge of the image. Shrink the layout slightly and '
                'leave at least 10% empty #FF00FF magenta margin on all four sides.'
            )
        elif code == 'small':
            lines.append(
                '- One or more figures were too small. Make the figures larger while keeping clear '
                'magenta gaps between them and margins around all four edges.'
            )
        elif code == 'rig_cut':
            if family == 'mounted':
                lines.append(
                    '- The rig could not separate all four legs below the belly. Draw the animal standing '
                    'square with FOUR separate vertical legs and visible #FF00FF magenta gaps between every '
                    'pair of neighbouring legs from hoof to belly; keep the tail well above the hooves.'
                )
            else:
                lines.append(
                    '- The rig could not separate the two legs below the garment hem. Stand upright with '
                    'both feet flat and a clear vertical #FF00FF magenta gap between the legs below the '
                    'hem; keep shields, cloaks, and weapons completely above the hem and clear of the boots.'
                )
        elif code == 'leg_stance':
            lines.append(
                f'- The legs were not standing like the stance guide ({message}). Draw both legs straight and '
                'VERTICAL and parallel directly under the hips, one boot-width apart, both boots flat on the same '
                'ground line and both pointing right, in a strict side view; no stride, no splayed inverted-V, '
                'no leg or boot turned toward the viewer.'
            )
        elif code == 'tint_leak':
            lines.append(
                f'- Bright red leaked onto non-team areas ({message}). Keep saturated pure red (#E01010) '
                'STRICTLY on the designated team-colour area; use brown, tan, grey, yellow-orange, or '
                'very dark maroon elsewhere.'
            )
        elif code == 'tint_missing':
            lines.append(
                '- Almost no saturated pure red (#E01010) was detected for the team-colour area. Paint the '
                'designated team-colour area clearly in bright pure red (#E01010) so it reads at 48 pixels.'
            )
        elif code == 'tint_excessive':
            lines.append(
                '- Too much of the unit was painted bright red. Restrict pure red (#E01010) ONLY to the '
                'designated team-colour area; paint skin, wood, leather, metal, or coat in non-red tones.'
            )
        elif code == 'magenta_halo':
            lines.append(
                '- Soft semi-transparent edges or smoke blended with the #FF00FF background and left a '
                'purple/magenta halo. Make every edge, flame, and smoke puff 100% solid, opaque, and '
                'hard-edged with a clean dark outline.'
            )
        else:
            lines.append(f'- Fix issue ({code}): {message}')

    if owner_note and owner_note.strip():
        lines.append(f'- Owner review feedback: {owner_note.strip()}')
    return '\n'.join(lines)
