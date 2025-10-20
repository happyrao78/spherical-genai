const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema({
  user_id: { type: String, required: true, unique: true },
  resume_url: { type: String },
}, {
  collection: 'profiles', 
  strict: false 
});

module.exports = mongoose.model('Profile', profileSchema);