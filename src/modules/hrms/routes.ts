import { Router } from 'express';
import { employeeRouter } from './employees/routes';
import { designationRouter } from './organization/designations';
import { orgChartRouter } from './organization/org-chart';
import { hrDepartmentRouter } from './organization/departments';
import { onboardingRouter } from './onboarding/routes';

// Every HRMS route lives under /api/v1/hrms/*.
export const hrmsRouter = Router();
hrmsRouter.use(employeeRouter);
hrmsRouter.use(designationRouter);
hrmsRouter.use(orgChartRouter);
hrmsRouter.use(hrDepartmentRouter);
hrmsRouter.use(onboardingRouter);
