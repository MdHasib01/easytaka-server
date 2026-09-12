import { Router } from 'express';
import { z } from 'zod';
import { MANAGEMENT_ROLES, PAYOUT_METHODS } from '../constants.js';
import * as ctrl from '../controllers/wallet.controller.js';
import { authenticate, authorize, requireSmm } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const withdrawSchema = z.object({
  amount: z.coerce.number().int().positive().max(1_000_000),
  method: z.enum(PAYOUT_METHODS),
  accountNumber: z
    .string()
    .trim()
    .regex(/^[0-9A-Za-z-]{4,40}$/, 'Invalid account number'),
});

const processSchema = z.object({
  action: z.enum(['approve', 'reject']),
  note: z.string().trim().max(500).optional(),
});

router.use(authenticate);
router.get('/', requireSmm, ctrl.summary);
router.get('/transactions', ctrl.transactions);
router.post('/withdrawals', requireSmm, validate(withdrawSchema), ctrl.withdraw);
router.get('/withdrawals', authorize(...MANAGEMENT_ROLES), ctrl.listWithdrawals);
router.patch('/withdrawals/:id', authorize(...MANAGEMENT_ROLES), validate(processSchema), ctrl.processWithdrawal);

export default router;
