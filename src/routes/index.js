import { Router } from 'express';
import { env } from '../config/env.js';
import accountRoutes from './account.routes.js';
import authRoutes from './auth.routes.js';
import brandRoutes from './brand.routes.js';
import demoRoutes from './demo.routes.js';
import messageRoutes from './message.routes.js';
import { missionRouter } from './mission.routes.js';
import notificationRoutes from './notification.routes.js';
import productRoutes from './product.routes.js';
import reviewRoutes from './review.routes.js';
import rewardRoutes from './reward.routes.js';
import smmRoutes from './smm.routes.js';
import submissionRoutes from './submission.routes.js';
import uploadRoutes from './upload.routes.js';
import userRoutes from './user.routes.js';
import walletRoutes from './wallet.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/brands', brandRoutes);
router.use('/products', productRoutes);
router.use('/smms', smmRoutes);
router.use('/accounts', accountRoutes);
router.use('/missions', missionRouter(false));
router.use('/rapid-tasks', missionRouter(true));
router.use('/submissions', submissionRoutes);
router.use('/reviews', reviewRoutes);
router.use('/wallet', walletRoutes);
router.use('/rewards', rewardRoutes);
router.use('/notifications', notificationRoutes);
router.use('/conversations', messageRoutes);
router.use('/uploads', uploadRoutes);
if (env.demoMode) router.use('/demo', demoRoutes);

export default router;
