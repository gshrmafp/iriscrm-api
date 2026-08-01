import { Response } from 'express';

export function ok(res: Response, data: unknown, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function paginated(
  res: Response,
  items: unknown[],
  meta: { page: number; pageSize: number; total: number },
) {
  return res.status(200).json({ success: true, data: items, meta });
}
