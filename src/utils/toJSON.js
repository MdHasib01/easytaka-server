// Serialises documents for the API: `_id` -> `id`, drops `__v`, includes virtuals.
// A schema's own toJSON transform (if any) still runs afterwards.
export function toJSONPlugin(schema) {
  const existing = schema.get('toJSON') || {};
  const ownTransform = existing.transform;

  schema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    ...existing,
    transform(doc, ret, options) {
      if (ret._id !== undefined) {
        ret.id = String(ret._id);
        delete ret._id;
      }
      delete ret.__v;
      if (typeof ownTransform === 'function') {
        return ownTransform(doc, ret, options) ?? ret;
      }
      return ret;
    },
  });
}
