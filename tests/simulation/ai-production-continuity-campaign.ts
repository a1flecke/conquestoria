import { runAICampaign } from './ai-playability-fixture';
import type { CampaignRoundSample } from './campaign-sample';

/** The one bounded campaign the fallback evidence is measured on (fixed seed; no wall-clock input). */
export function runContinuityCampaign(): CampaignRoundSample[] {
  const samples: CampaignRoundSample[] = [];
  runAICampaign({
    seed: 'continuity-baseline',
    challenge: 'standard',
    turns: 60,
    mapSize: 'small',
    humanCount: 1,
    aiCount: 2,
    personalitySet: ['expansionist', 'diplomatic'],
    observe: sample => samples.push(sample),
  });
  return samples;
}
