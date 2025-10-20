// server/models/Job.js
const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  title: { type: String, required: true },
  company: { type: String, required: true },
  description: { type: String, required: true },
  role: { type: String, required: true },
  salary: { type: String, required: true },
  requirements: String,
  postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Make it required
}, { timestamps: true });

module.exports = mongoose.model('Job', jobSchema);