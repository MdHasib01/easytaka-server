import { Smm, Transaction } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { startOfWeek, weekKey } from '../utils/dates.js';
import { notify } from './notification.service.js';

/**
 * Credits an SMM's wallet. When `reference` is given the credit is idempotent:
 * a second call with the same reference is a no-op and returns null.
 */
export async function credit(smmId, { amount, title, description, category, reference, brand }) {
  if (!(amount > 0)) return null;

  let tx;
  try {
    tx = await Transaction.create({
      smm: smmId,
      brand,
      type: 'credit',
      category,
      title,
      description,
      amount,
      reference,
      status: 'Completed',
    });
  } catch (err) {
    if (err?.code === 11000 && reference) return null; // already paid
    throw err;
  }

  const smm = await Smm.findByIdAndUpdate(
    smmId,
    { $inc: { walletBalance: amount } },
    { returnDocument: 'after' },
  );
  tx.balanceAfter = smm?.walletBalance;
  await tx.save();
  return tx;
}

const maskAccountNumber = (n) =>
  n.length <= 4 ? n : `${'*'.repeat(Math.min(6, n.length - 4))}${n.slice(-4)}`;

/** Moves money out of the wallet immediately and records a pending payout. */
export async function requestWithdrawal(smm, { amount, method, accountNumber }, minWithdrawal) {
  if (amount < minWithdrawal) throw ApiError.badRequest(`Minimum withdrawal is ৳${minWithdrawal}`);

  const updated = await Smm.findOneAndUpdate(
    { _id: smm._id, walletBalance: { $gte: amount } },
    { $inc: { walletBalance: -amount } },
    { returnDocument: 'after' },
  );
  if (!updated) throw ApiError.badRequest('Insufficient wallet balance');

  return Transaction.create({
    smm: smm._id,
    brand: smm.brand,
    type: 'debit',
    category: 'withdrawal',
    title: 'Withdrawal Request',
    description: `${method} • ${maskAccountNumber(accountNumber)}`,
    amount,
    status: 'Pending',
    balanceAfter: updated.walletBalance,
    payout: { method, accountNumber },
  });
}

/** Approves (marks paid) or rejects (refunds) a pending withdrawal. */
export async function processWithdrawal(txId, action, actor, note) {
  const status = action === 'approve' ? 'Completed' : 'Rejected';
  const tx = await Transaction.findOneAndUpdate(
    { _id: txId, category: 'withdrawal', status: 'Pending' },
    { $set: { status, processedBy: actor._id, processedAt: new Date(), note } },
    { returnDocument: 'after' },
  );
  if (!tx) throw ApiError.conflict('Withdrawal not found or already processed');

  const smm = await Smm.findById(tx.smm).select('user');
  if (status === 'Rejected') {
    await Smm.updateOne({ _id: tx.smm }, { $inc: { walletBalance: tx.amount } });
    await notify(smm?.user, 'Withdrawal Rejected', `৳${tx.amount} has been returned to your wallet.${note ? ` ${note}` : ''}`, 'warning');
  } else {
    await notify(smm?.user, 'Withdrawal Paid', `৳${tx.amount} has been sent via ${tx.payout?.method}.`, 'success');
  }
  return tx;
}

export async function weeklyEarnings(smmId) {
  const [row] = await Transaction.aggregate([
    {
      $match: {
        smm: smmId,
        type: 'credit',
        status: 'Completed',
        category: { $ne: 'adjustment' },
        createdAt: { $gte: startOfWeek() },
      },
    },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return row?.total ?? 0;
}

/** Credits the weekly base salary to every active Job Holder of a brand. Safe to re-run. */
export async function runWeeklyPayroll(brand) {
  const week = weekKey();
  const salary = brand.settings.weeklyBaseSalary;
  const smms = await Smm.find({ brand: brand._id, status: 'Active', jobHolderUnlocked: true });

  let credited = 0;
  for (const smm of smms) {
    const tx = await credit(smm._id, {
      brand: brand._id,
      amount: salary,
      category: 'salary',
      title: 'Weekly Base Salary',
      description: `${week} (${smm.approvedEnrichedIds} IDs)`,
      reference: `salary:${smm._id}:${week}`,
    });
    if (tx) {
      credited += 1;
      await notify(smm.user, 'Salary Credited', `৳${salary} base salary for ${week} was added to your wallet.`, 'success');
    }
  }
  return { week, salary, eligible: smms.length, credited, skipped: smms.length - credited };
}
