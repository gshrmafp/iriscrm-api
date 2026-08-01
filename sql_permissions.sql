INSERT INTO role_permissions (id, role, "permissionKey", "createdAt")
SELECT gen_random_uuid()::text, r::"Role", p, NOW()
FROM (VALUES
  ('SUPER_ADMIN', 'sales.query.reassign_owner'),
  ('SUPER_ADMIN', 'sales.query.followup.view'),
  ('SUPER_ADMIN', 'sales.query.followup.manage'),
  ('SUPER_ADMIN', 'sales.report.export'),
  ('SUPER_ADMIN', 'sales.dashboard.view'),
  ('REGIONAL_ADMIN', 'sales.query.reassign_owner'),
  ('REGIONAL_ADMIN', 'sales.query.followup.view'),
  ('REGIONAL_ADMIN', 'sales.query.followup.manage'),
  ('REGIONAL_ADMIN', 'sales.report.export'),
  ('REGIONAL_ADMIN', 'sales.dashboard.view'),
  ('SALES_MANAGER', 'sales.query.reassign_owner'),
  ('SALES_MANAGER', 'sales.query.followup.view'),
  ('SALES_MANAGER', 'sales.query.followup.manage'),
  ('SALES_MANAGER', 'sales.dashboard.view'),
  ('SALES_EXECUTIVE', 'sales.query.followup.view'),
  ('SALES_EXECUTIVE', 'sales.query.followup.manage'),
  ('SALES_EXECUTIVE', 'sales.dashboard.view'),
  ('AUDITOR', 'sales.query.followup.view'),
  ('AUDITOR', 'sales.dashboard.view')
) AS t(r,p)
ON CONFLICT (role, "permissionKey") DO NOTHING;

SELECT role, "permissionKey" FROM role_permissions
WHERE "permissionKey" IN (
  'sales.query.reassign_owner',
  'sales.query.followup.view',
  'sales.query.followup.manage',
  'sales.report.export',
  'sales.dashboard.view'
)
ORDER BY role, "permissionKey";
