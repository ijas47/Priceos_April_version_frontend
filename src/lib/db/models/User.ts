import mongoose, { Document, Schema, Model } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  refreshToken?: string;
  role: "owner" | "admin" | "viewer";
  isApproved: boolean;
  fullName?: string;
  plan: "starter" | "growth" | "scale";
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name:         { type: String, required: true },
    email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    refreshToken: { type: String },
    role:         { type: String, enum: ["owner", "admin", "viewer"], default: "owner" },
    isApproved:   { type: Boolean, default: true },
    fullName:     { type: String },
    plan:         { type: String, enum: ["starter", "growth", "scale"], default: "starter" },
  },
  { timestamps: true, collection: "users" }   // ← explicitly targets the "users" collection
);

export const User: Model<IUser> =
  mongoose.models.User ?? mongoose.model<IUser>("User", UserSchema);
