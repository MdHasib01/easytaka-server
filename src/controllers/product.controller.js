import { Mission, Product, Smm } from '../models/index.js';
import { setSmmProducts } from '../services/workforce.service.js';
import { assertBrandAccess, brandFilter, brandForWrite, sameId } from '../utils/access.js';
import { ApiError } from '../utils/ApiError.js';
import { escapeRegex, queryEnum } from '../utils/http.js';

async function withAssignedCounts(products) {
  const ids = products.map((p) => p._id);
  const rows = ids.length
    ? await Smm.aggregate([
        { $match: { assignedProductIds: { $in: ids } } },
        { $unwind: '$assignedProductIds' },
        { $match: { assignedProductIds: { $in: ids } } },
        { $group: { _id: '$assignedProductIds', count: { $sum: 1 } } },
      ])
    : [];
  const counts = new Map(rows.map((r) => [String(r._id), r.count]));
  return products.map((p) => ({ ...p.toJSON(), assignedSmmCount: counts.get(String(p._id)) ?? 0 }));
}

async function loadProduct(req) {
  const product = await Product.findById(req.params.id);
  if (!product) throw ApiError.notFound('Product not found');
  assertBrandAccess(req, product.brand);
  return product;
}

async function loadSmmForProduct(product, smmId) {
  const smm = await Smm.findById(smmId);
  if (!smm || !sameId(smm.brand, product.brand)) throw ApiError.notFound('SMM not found in this brand');
  return smm;
}

export async function list(req, res) {
  const filter = { ...brandFilter(req) };
  const status = queryEnum(req.query.status, ['Active', 'Inactive'], 'status');
  if (status) filter.status = status;
  if (req.smm && req.query.mine === 'true') filter._id = { $in: req.smm.assignedProductIds };
  if (req.query.q) filter.name = { $regex: escapeRegex(req.query.q), $options: 'i' };

  const products = await Product.find(filter).sort({ name: 1 });
  res.json(await withAssignedCounts(products));
}

export async function get(req, res) {
  const [product] = await withAssignedCounts([await loadProduct(req)]);
  res.json(product);
}

export async function create(req, res) {
  const { brandId, ...fields } = req.body;
  const product = await Product.create({ ...fields, brand: brandForWrite(req, brandId) });
  res.status(201).json({ ...product.toJSON(), assignedSmmCount: 0 });
}

export async function update(req, res) {
  const product = await loadProduct(req);
  product.set(req.body);
  await product.save();
  const [json] = await withAssignedCounts([product]);
  res.json(json);
}

export async function remove(req, res) {
  const product = await loadProduct(req);
  await Smm.updateMany({ assignedProductIds: product._id }, { $pull: { assignedProductIds: product._id } });
  await Mission.updateMany({ product: product._id }, { $set: { product: null } });
  await product.deleteOne();
  res.status(204).end();
}

export async function assign(req, res) {
  const product = await loadProduct(req);
  const smm = await loadSmmForProduct(product, req.body.smmId);
  await setSmmProducts(smm, [...smm.assignedProductIds.map(String), String(product._id)]);
  const [json] = await withAssignedCounts([product]);
  res.json(json);
}

export async function unassign(req, res) {
  const product = await loadProduct(req);
  const smm = await loadSmmForProduct(product, req.params.smmId);
  smm.assignedProductIds.pull(product._id);
  await smm.save();
  const [json] = await withAssignedCounts([product]);
  res.json(json);
}
