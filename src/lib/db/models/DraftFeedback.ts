import mongoose, { Document, Schema, Model } from "mongoose";

export interface IDraftFeedback extends Document {
  orgId: mongoose.Types.ObjectId;
  conversationId: string;
  feedback: "good" | "bad";
  draft: string;
  createdAt: Date;
  updatedAt: Date;
}

const DraftFeedbackSchema = new Schema<IDraftFeedback>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    conversationId: { type: String, required: true },
    feedback: { type: String, enum: ["good", "bad"], required: true },
    draft: { type: String, default: "" },
  },
  { timestamps: true }
);

export const DraftFeedback: Model<IDraftFeedback> =
  mongoose.models.DraftFeedback ??
  mongoose.model<IDraftFeedback>("DraftFeedback", DraftFeedbackSchema);
