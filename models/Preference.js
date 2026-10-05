const mongoose = require('mongoose');

const preferenceSchema = new mongoose.Schema({
  learningStyle: { type: String, default: 'plain-language, use analogies' },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Preference', preferenceSchema);