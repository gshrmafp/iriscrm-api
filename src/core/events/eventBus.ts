import { EventEmitter } from 'events';
import { logger } from '../logger/logger';

// In-process domain event bus (Infra doc 5.1: "communication between modules goes
// through exported service functions and an internal event emitter — never direct
// table access"). When a module is split into its own service later, subscribers
// here move to a real queue/broker without changing the emit call sites.
class EventBus extends EventEmitter {
  publish<T extends object>(eventName: string, payload: T) {
    logger.info({ event: eventName, payload }, `domain event: ${eventName}`);
    this.emit(eventName, payload);
  }
}

export const eventBus = new EventBus();

export const DOMAIN_EVENTS = {
  OPPORTUNITY_WON: 'OpportunityWon',
  OPPORTUNITY_LOST: 'OpportunityLost',
  QUOTATION_ISSUED: 'QuotationIssued',
  AMC_RENEWAL_DUE: 'AmcRenewalDue',
  SALES_QUERY_CREATED: 'SalesQueryCreated',
  SALES_QUERY_CLOSED: 'SalesQueryClosed',
  SALES_QUERY_ASSIGNED: 'SalesQueryAssigned',
  SALES_QUERY_STATUS_CHANGED: 'SalesQueryStatusChanged',
  SALES_QUERY_PRIORITY_CHANGED: 'SalesQueryPriorityChanged',
  SALES_QUERY_DUE_DATE_UPDATED: 'SalesQueryDueDateUpdated',
  SALES_QUERY_ATTACHMENT_UPLOADED: 'SalesQueryAttachmentUploaded',
  SALES_QUERY_COMMENT_ADDED: 'SalesQueryCommentAdded',
  SALES_QUERY_MENTIONED: 'SalesQueryMentioned',
  FOLLOW_UP_DUE: 'FollowUpDue',
  FOLLOW_UP_OVERDUE: 'FollowUpOverdue',
  // Shared by Lead and Opportunity comments (EntityComment) — mirrors
  // SALES_QUERY_MENTIONED for Sales Query comments.
  ENTITY_COMMENT_MENTIONED: 'EntityCommentMentioned',
} as const;
