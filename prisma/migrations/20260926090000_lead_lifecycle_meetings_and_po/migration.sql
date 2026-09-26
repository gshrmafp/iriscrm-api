-- ============================================================================
-- Lead lifecycle redesign: Meeting entity, loggedAtStage tracking, Purchase
-- Order fields, and the OpportunityStage vocabulary rename.
--
-- SAFE FOR PRODUCTION DATA:
--   - Legacy Lead columns (source, sourceOther, productInterest,
--     productInterestOther, notes, address, customerId) are intentionally
--     LEFT IN PLACE — they're no longer declared in schema.prisma or used by
--     the app, but dropping them would permanently destroy any historical
--     data real users entered before this redesign. They simply become
--     inert/orphaned columns Prisma no longer reads or writes.
--   - Every existing Opportunity / OpportunityStageHistory row is remapped
--     to the new stage vocabulary rather than dropped or left dangling:
--       NEW, CONTACTED, QUALIFIED, QUOTED  -> QUOTATION
--       NEGOTIATION                        -> FOLLOWUP
--       MEETING                            -> MEETING      (unchanged)
--       WON                                -> PURCHASE_ORDER
--       LOST                               -> LOST          (unchanged)
--     This mapping is the one used by the app's actual field-sales workflow:
--     everything up through "a quotation exists" collapses into QUOTATION
--     (the new flow captures quotation details at qualification time, not
--     across several separate stages), NEGOTIATION (active back-and-forth)
--     maps to FOLLOWUP, and WON maps to PURCHASE_ORDER (the deal is closed
--     once a real PO is captured, replacing the old bare "Won" toggle).
-- ============================================================================

-- 1. New LeadMeeting entity — a physical meeting log (note + silently
--    captured GPS), loggable at any point in a lead's life, same as follow-ups.
CREATE TABLE "lead_meetings" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "gpsLatitude" DECIMAL(10,7),
    "gpsLongitude" DECIMAL(10,7),
    "visitLocation" TEXT,
    "loggedAtStage" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lead_meetings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "lead_meetings_leadId_idx" ON "lead_meetings"("leadId");

ALTER TABLE "lead_meetings" ADD CONSTRAINT "lead_meetings_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. loggedAtStage on the existing follow-up log — a snapshot of which named
--    stage was active at the moment each follow-up was logged.
ALTER TABLE "lead_follow_ups" ADD COLUMN "loggedAtStage" TEXT;

-- 3. Purchase Order fields on Opportunity, captured by the Win flow.
ALTER TABLE "opportunities"
    ADD COLUMN "poNumber" TEXT,
    ADD COLUMN "poDate" TIMESTAMP(3),
    ADD COLUMN "poRemarks" TEXT,
    ADD COLUMN "poGpsLatitude" DECIMAL(10,7),
    ADD COLUMN "poGpsLongitude" DECIMAL(10,7),
    ADD COLUMN "poLocation" TEXT,
    ADD COLUMN "poAmount" DECIMAL(14,2);

-- 4. OpportunityStage enum rename + data remap.
--    Uses a shadow-column approach (build the final enum type up front, copy
--    + remap data into a new column, then swap it into place) rather than
--    ALTER TYPE ... ADD/RENAME VALUE, to avoid Postgres's restrictions on
--    using a newly-added enum value within the same transaction.
CREATE TYPE "OpportunityStage_new" AS ENUM ('QUOTATION', 'FOLLOWUP', 'MEETING', 'PURCHASE_ORDER', 'LOST');

-- 4a. opportunities.stage
ALTER TABLE "opportunities" ADD COLUMN "stage_new" "OpportunityStage_new";
UPDATE "opportunities" SET "stage_new" = (CASE "stage"::text
    WHEN 'NEW' THEN 'QUOTATION'
    WHEN 'CONTACTED' THEN 'QUOTATION'
    WHEN 'QUALIFIED' THEN 'QUOTATION'
    WHEN 'QUOTED' THEN 'QUOTATION'
    WHEN 'NEGOTIATION' THEN 'FOLLOWUP'
    WHEN 'MEETING' THEN 'MEETING'
    WHEN 'WON' THEN 'PURCHASE_ORDER'
    WHEN 'LOST' THEN 'LOST'
END)::"OpportunityStage_new";
ALTER TABLE "opportunities" ALTER COLUMN "stage_new" SET NOT NULL;
ALTER TABLE "opportunities" DROP COLUMN "stage";
ALTER TABLE "opportunities" RENAME COLUMN "stage_new" TO "stage";
ALTER TABLE "opportunities" ALTER COLUMN "stage" SET DEFAULT 'QUOTATION';

-- 4b. opportunity_stage_history.fromStage (nullable — only null on each
--     opportunity's very first history row)
ALTER TABLE "opportunity_stage_history" ADD COLUMN "fromStage_new" "OpportunityStage_new";
UPDATE "opportunity_stage_history" SET "fromStage_new" = (CASE "fromStage"::text
    WHEN 'NEW' THEN 'QUOTATION'
    WHEN 'CONTACTED' THEN 'QUOTATION'
    WHEN 'QUALIFIED' THEN 'QUOTATION'
    WHEN 'QUOTED' THEN 'QUOTATION'
    WHEN 'NEGOTIATION' THEN 'FOLLOWUP'
    WHEN 'MEETING' THEN 'MEETING'
    WHEN 'WON' THEN 'PURCHASE_ORDER'
    WHEN 'LOST' THEN 'LOST'
    ELSE NULL
END)::"OpportunityStage_new"
WHERE "fromStage" IS NOT NULL;
ALTER TABLE "opportunity_stage_history" DROP COLUMN "fromStage";
ALTER TABLE "opportunity_stage_history" RENAME COLUMN "fromStage_new" TO "fromStage";

-- 4c. opportunity_stage_history.toStage (never null)
ALTER TABLE "opportunity_stage_history" ADD COLUMN "toStage_new" "OpportunityStage_new";
UPDATE "opportunity_stage_history" SET "toStage_new" = (CASE "toStage"::text
    WHEN 'NEW' THEN 'QUOTATION'
    WHEN 'CONTACTED' THEN 'QUOTATION'
    WHEN 'QUALIFIED' THEN 'QUOTATION'
    WHEN 'QUOTED' THEN 'QUOTATION'
    WHEN 'NEGOTIATION' THEN 'FOLLOWUP'
    WHEN 'MEETING' THEN 'MEETING'
    WHEN 'WON' THEN 'PURCHASE_ORDER'
    WHEN 'LOST' THEN 'LOST'
END)::"OpportunityStage_new";
ALTER TABLE "opportunity_stage_history" ALTER COLUMN "toStage_new" SET NOT NULL;
ALTER TABLE "opportunity_stage_history" DROP COLUMN "toStage";
ALTER TABLE "opportunity_stage_history" RENAME COLUMN "toStage_new" TO "toStage";

-- 4d. Swap the enum type itself now that no column references the old one.
DROP TYPE "OpportunityStage";
ALTER TYPE "OpportunityStage_new" RENAME TO "OpportunityStage";

-- 5. Backfill probability to match each opportunity's remapped stage (the
--    pipeline-weight percentage shown in forecasting) — cosmetic/forecast
--    data, not required for correctness, but keeps existing deals' numbers
--    consistent with the new stage they just landed on.
UPDATE "opportunities" SET "probability" = (CASE "stage"::text
    WHEN 'QUOTATION' THEN 50
    WHEN 'FOLLOWUP' THEN 65
    WHEN 'MEETING' THEN 80
    WHEN 'PURCHASE_ORDER' THEN 100
    WHEN 'LOST' THEN 0
END);
ALTER TABLE "opportunities" ALTER COLUMN "probability" SET DEFAULT 50;
