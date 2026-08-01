import { OpportunityStage } from '@prisma/client';

// SM-2.1 default pipeline (configurable per region later via a config table).
export const STAGE_PROBABILITY: Record<OpportunityStage, number> = {
  NEW: 10,
  CONTACTED: 25,
  QUOTED: 50,
  NEGOTIATION: 75,
  WON: 100,
  LOST: 0,
};

// Allowed forward transitions via the generic PATCH /stage endpoint; LOST is
// reachable from any open stage. WON is intentionally excluded here — reaching
// WON always goes through the dedicated win() flow (POST /win), which
// transactionally creates the AmcContract/Project hand-off (SM-4.1, SM-5.4).
const FORWARD: Record<OpportunityStage, OpportunityStage[]> = {
  NEW: [OpportunityStage.CONTACTED, OpportunityStage.LOST],
  CONTACTED: [OpportunityStage.QUOTED, OpportunityStage.LOST],
  QUOTED: [OpportunityStage.NEGOTIATION, OpportunityStage.LOST],
  NEGOTIATION: [OpportunityStage.LOST],
  WON: [],
  LOST: [],
};

export function isValidTransition(from: OpportunityStage, to: OpportunityStage): boolean {
  return FORWARD[from]?.includes(to) ?? false;
}
