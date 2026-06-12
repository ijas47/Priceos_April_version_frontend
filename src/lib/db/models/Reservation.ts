import mongoose, { Document, Schema, Model } from "mongoose";

export interface IReservation extends Document {
  orgId: mongoose.Types.ObjectId;
  listingId: mongoose.Types.ObjectId;
  hostawayReservationId?: string;
  guestName: string;
  guestEmail?: string;
  guestPhone?: string;
  checkIn: string; // "YYYY-MM-DD"
  checkOut: string; // "YYYY-MM-DD"
  nights: number;
  guests: number;
  totalPrice: number;
  channelName: string;
  status: "confirmed" | "pending" | "cancelled" | "checked_in" | "checked_out" | "inquiry";
  source?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ReservationSchema = new Schema<IReservation>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    listingId: { type: Schema.Types.ObjectId, ref: "Listing", required: true },
    hostawayReservationId: { type: String, sparse: true },
    guestName: { type: String, default: "Unknown Guest" },
    guestEmail: { type: String },
    guestPhone: { type: String },
    checkIn: { type: String, required: true },
    checkOut: { type: String, required: true },
    nights: { type: Number, default: 1 },
    guests: { type: Number, default: 1 },
    totalPrice: { type: Number, default: 0 },
    channelName: { type: String, default: "Direct" },
    status: {
      type: String,
      enum: ["confirmed", "pending", "cancelled", "checked_in", "checked_out", "inquiry"],
      default: "confirmed",
    },
    source: { type: String },
    notes: { type: String },
  },
  { timestamps: true }
);

ReservationSchema.index({ listingId: 1, checkIn: 1, checkOut: 1 });

export const Reservation: Model<IReservation> =
  mongoose.models.Reservation ??
  mongoose.model<IReservation>("Reservation", ReservationSchema);
