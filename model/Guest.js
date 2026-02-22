const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 0 },
    type: { type: String, enum: ["naqd", "click", "bank", "karta"], required: true },
    note: { type: String, trim: true, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const actionBySchema = new mongoose.Schema(
  {
    userId: { type: String, default: "" },
    role: { type: String, default: "" },
    login: { type: String, default: "" },
  },
  { _id: false }
);

const guestSchema = new mongoose.Schema(
  {
    firstname: { type: String, required: true, trim: true },
    lastname: { type: String, required: true, trim: true },
    passport: { type: String, required: true, trim: true },
    birthDate: { type: Date, required: true },
    phone: { type: String, trim: true, default: "" },
    guestType: { type: String, enum: ["uzb", "chetellik"], default: "uzb" },
    vip: { type: Boolean, default: false },
    vipRequestStatus: {
      type: String,
      enum: ["none", "pending", "approved", "rejected"],
      default: "none",
    },
    vipRequestedBy: { type: actionBySchema, default: null },
    vipApprovedBy: { type: actionBySchema, default: null },
    vipApprovedAt: { type: Date, default: null },
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    stayDays: { type: Number, required: true, min: 1, default: 1 },
    billableDays: { type: Number, required: true, min: 1, default: 1 },
    checkoutReminderAt: { type: Date, default: null },
    checkoutDueAt: { type: Date, default: null },
    dailyRate: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    debtAmount: { type: Number, default: 0, min: 0 },
    payments: { type: [paymentSchema], default: [] },
    status: { type: String, enum: ["active", "checked_out"], default: "active" },
    acceptedBy: { type: actionBySchema, default: null },
    checkoutBy: { type: actionBySchema, default: null },
    checkInAt: { type: Date, default: Date.now },
    checkOutAt: { type: Date, default: null },
    note: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Guest", guestSchema);
