import { ROLES } from '../constants.js';
import { Brand, Product, Smm, User } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';

/** Creates the login user and the SMM profile together (rolls back the user on failure). */
export async function createSmmWithUser({
  name,
  email,
  password,
  phone,
  brandId,
  nidDivision,
  assignedWorkingDivision,
  designation,
  nid,
  verification,
}) {
  if (await User.exists({ email })) throw ApiError.conflict('An account with this email already exists');

  const user = await User.create({ name, email, password, phone, role: ROLES.SMM, brand: brandId });
  try {
    const smm = await Smm.create({
      user: user._id,
      brand: brandId,
      nidDivision,
      assignedWorkingDivision,
      designation,
      nid,
      verification,
    });
    return { user, smm };
  } catch (err) {
    await User.deleteOne({ _id: user._id });
    throw err;
  }
}

/** Replaces an SMM's product assignments, enforcing the brand's products-per-SMM rule. */
export async function setSmmProducts(smm, productIds) {
  const ids = [...new Set(productIds.map(String))];
  const brand = await Brand.findById(smm.brand).select('settings');
  const limit = brand?.settings?.productsPerSmm ?? 4;
  if (ids.length > limit) {
    throw ApiError.badRequest(`An SMM can handle at most ${limit} products for this brand`);
  }

  const valid = await Product.countDocuments({ _id: { $in: ids }, brand: smm.brand, status: 'Active' });
  if (valid !== ids.length) {
    throw ApiError.badRequest("All products must be active products of the SMM's brand");
  }

  smm.assignedProductIds = ids;
  await smm.save();
  return smm;
}
