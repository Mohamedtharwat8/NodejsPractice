const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  interactionId: { type: String, required: true, unique: true },
  tenantId: { type: Number, required: true, index: true },
  actorId: Number,
  feature: { type: String, required: true },
  promptVersion: { type: String, required: true },
  status: { type: String, required: true },
  inputTokens: { type: Number, default: 0 },
  outputTokens: { type: Number, default: 0 },
  accepted: { type: Boolean, default: false },
  errorCode: String,
  createdAt: { type: Date, default: Date.now },
  acceptedAt: Date,
}, { versionKey: false, minimize: false });

schema.index({ tenantId: 1, createdAt: -1 });
module.exports = mongoose.models.AiInteraction || mongoose.model("AiInteraction", schema, "ai_interactions");
