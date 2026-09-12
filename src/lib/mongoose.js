// Single configured mongoose instance. Every model imports mongoose from here so the
// global plugin is registered before any model is compiled.
import mongoose from 'mongoose';
import { toJSONPlugin } from '../utils/toJSON.js';

mongoose.set('strictQuery', true);
mongoose.plugin(toJSONPlugin);

export default mongoose;
