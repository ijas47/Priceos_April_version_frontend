import mongoose, { Document, Schema, Model } from "mongoose";

export interface IChatMessage extends Document {
  orgId: mongoose.Types.ObjectId;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  context?: {
    type: "portfolio" | "property";
    propertyId?: mongoose.Types.ObjectId;
  };
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const ChatMessageSchema = new Schema<IChatMessage>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    role: {
      type: String,
      enum: ["user", "assistant", "system"],
      required: true,
    },
    content: { type: String, required: true },
    context: {
      type: { type: String, enum: ["portfolio", "property"] },
      propertyId: { type: Schema.Types.ObjectId, ref: "Listing" },
    },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

ChatMessageSchema.index({ orgId: 1, sessionId: 1, createdAt: 1 });

export const ChatMessage: Model<IChatMessage> =
  mongoose.models.ChatMessage ??
  mongoose.model<IChatMessage>("ChatMessage", ChatMessageSchema);
