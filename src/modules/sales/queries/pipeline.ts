import { SalesQueryStatus } from '@prisma/client';

// Sales Query Management status workflow with loops.
// Terminal states WON / LOST / CANCELLED must go through -> CLOSED.
const FORWARD: Record<SalesQueryStatus, SalesQueryStatus[]> = {
  NEW: [SalesQueryStatus.ASSIGNED, SalesQueryStatus.CANCELLED],
  ASSIGNED: [SalesQueryStatus.UNDER_REVIEW, SalesQueryStatus.CANCELLED, SalesQueryStatus.WAITING_FOR_INTERNAL_TEAM],
  UNDER_REVIEW: [
    SalesQueryStatus.WAITING_FOR_CUSTOMER,
    SalesQueryStatus.WAITING_FOR_INTERNAL_TEAM,
    SalesQueryStatus.QUOTATION_PREPARATION,
    SalesQueryStatus.QUOTATION_PREPARED,
    SalesQueryStatus.LOST,
    SalesQueryStatus.CANCELLED,
  ],
  WAITING_FOR_CUSTOMER: [
    SalesQueryStatus.UNDER_REVIEW,
    SalesQueryStatus.QUOTATION_PREPARATION,
    SalesQueryStatus.QUOTATION_PREPARED,
    SalesQueryStatus.LOST,
    SalesQueryStatus.CANCELLED,
  ],
  WAITING_FOR_INTERNAL_TEAM: [
    SalesQueryStatus.UNDER_REVIEW,
    SalesQueryStatus.QUOTATION_PREPARATION,
    SalesQueryStatus.QUOTATION_PREPARED,
    SalesQueryStatus.CANCELLED,
  ],
  QUOTATION_PREPARATION: [
    SalesQueryStatus.QUOTATION_PREPARED,
    SalesQueryStatus.UNDER_REVIEW,
    SalesQueryStatus.WAITING_FOR_INTERNAL_TEAM,
    SalesQueryStatus.CANCELLED,
  ],
  QUOTATION_PREPARED: [
    SalesQueryStatus.QUOTATION_SENT,
    SalesQueryStatus.QUOTATION_PREPARATION,
    SalesQueryStatus.UNDER_REVIEW,
    SalesQueryStatus.CANCELLED,
  ],
  QUOTATION_SENT: [
    SalesQueryStatus.NEGOTIATION,
    SalesQueryStatus.WON,
    SalesQueryStatus.LOST,
    SalesQueryStatus.WAITING_FOR_CUSTOMER,
    SalesQueryStatus.QUOTATION_PREPARATION,
  ],
  NEGOTIATION: [SalesQueryStatus.WON, SalesQueryStatus.LOST, SalesQueryStatus.QUOTATION_PREPARATION, SalesQueryStatus.QUOTATION_PREPARED],
  WON: [SalesQueryStatus.CLOSED],
  LOST: [SalesQueryStatus.CLOSED],
  CANCELLED: [SalesQueryStatus.CLOSED],
  CLOSED: [],
};

export function isValidQueryTransition(from: SalesQueryStatus, to: SalesQueryStatus): boolean {
  return FORWARD[from]?.includes(to) ?? false;
}

// Statuses that require a mandatory remark on entry.
export const REMARK_REQUIRED_STATUSES: SalesQueryStatus[] = [
  SalesQueryStatus.LOST,
  SalesQueryStatus.CANCELLED,
  SalesQueryStatus.WAITING_FOR_CUSTOMER,
  SalesQueryStatus.WAITING_FOR_INTERNAL_TEAM,
  SalesQueryStatus.CLOSED,
];

// Human-readable labels for the UI
export const STATUS_LABELS: Record<SalesQueryStatus, string> = {
  [SalesQueryStatus.NEW]: 'New',
  [SalesQueryStatus.ASSIGNED]: 'Assigned',
  [SalesQueryStatus.UNDER_REVIEW]: 'Under Review',
  [SalesQueryStatus.WAITING_FOR_CUSTOMER]: 'Waiting for Customer',
  [SalesQueryStatus.WAITING_FOR_INTERNAL_TEAM]: 'Waiting for Internal Team',
  [SalesQueryStatus.QUOTATION_PREPARATION]: 'Quotation Preparation',
  [SalesQueryStatus.QUOTATION_PREPARED]: 'Quotation Ready',
  [SalesQueryStatus.QUOTATION_SENT]: 'Quotation Sent',
  [SalesQueryStatus.NEGOTIATION]: 'Negotiation',
  [SalesQueryStatus.WON]: 'Won',
  [SalesQueryStatus.LOST]: 'Lost',
  [SalesQueryStatus.CANCELLED]: 'Cancelled',
  [SalesQueryStatus.CLOSED]: 'Closed',
};

export const TERMINAL_STATUSES: SalesQueryStatus[] = [
  SalesQueryStatus.WON,
  SalesQueryStatus.LOST,
  SalesQueryStatus.CANCELLED,
  SalesQueryStatus.CLOSED,
];
