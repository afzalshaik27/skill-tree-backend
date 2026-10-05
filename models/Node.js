const mongoose = require('mongoose');

const nodeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Node', default: null },
  rootId: { type: mongoose.Schema.Types.ObjectId, ref: 'Node', default: null },
  children: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Node' }],

  goal: { type: String, default: '' },
  clarifyingQuestions: [{ type: String }],
  intakeAnswers: [{
    question: { type: String },
    answer: { type: String },
  }],

  explanation: { type: String, default: '' },
  status: { type: String, enum: ['awaiting_intake', 'ready'], default: 'awaiting_intake' },
  generated: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Node', nodeSchema);