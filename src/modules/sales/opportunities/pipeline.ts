import { OpportunityStage } from '@prisma/client';

// SM-2.1 default pipeline (configurable per region later via a config table).
export const STAGE_PROBABILITY: Record<OpportunityStage, number> = {
  QUOTATION: 50,
  FOLLOWUP: 65,
  MEETING: 80,
  PURCHASE_ORDER: 100,
  LOST: 0,
};

// Allowed forward transitions via the generic PATCH /stage endpoint; LOST is
// reachable from any open stage. PURCHASE_ORDER is intentionally excluded
// here — reaching it always goes through the dedicated win() flow (POST
// /win), which transactionally creates the AmcContract/Project hand-off
// (SM-4.1, SM-5.4) and captures the PO fields. FOLLOWUP/MEETING are also
// normally reached automatically (never-regress) when a follow-up/meeting is
// logged against the lead — see leads/service.ts's advanceOpportunityStage —
// but stay valid here too for a manual correction via the generic endpoint.
const FORWARD: Record<OpportunityStage, OpportunityStage[]> = {
  QUOTATION: [OpportunityStage.FOLLOWUP, OpportunityStage.MEETING, OpportunityStage.LOST],
  FOLLOWUP: [OpportunityStage.MEETING, OpportunityStage.LOST],
  MEETING: [OpportunityStage.LOST],
  PURCHASE_ORDER: [],
  LOST: [],
};

export function isValidTransition(from: OpportunityStage, to: OpportunityStage): boolean {
  return FORWARD[from]?.includes(to) ?? false;
}
