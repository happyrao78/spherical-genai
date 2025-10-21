const mongoose = require('mongoose');

// This schema is designed to read the data saved by your Python service.
const profileSchema = new mongoose.Schema({
  user_id: {
    type: String,
    required: true,
    unique: true,
  },
  resume_url: {
    type: String,
    default: null,
  },
}, {
  collection: 'profiles', // This tells Mongoose to use the existing 'profiles' collection.
  strict: false, // This allows documents to have extra fields not defined in the schema.
});

module.exports = mongoose.model('Profile', profileSchema);