const moment = require("moment-timezone");
const Guest = require("../model/Guest");
const {
  applyTimeToDate,
  getHotelSettings,
  parseTime,
} = require("../utils/hotelSettings");

const DAY_MS = 24 * 60 * 60 * 1000;
const APP_TIMEZONE = process.env.APP_TIMEZONE || "Asia/Tashkent";

// Mijozning billing holatini joriy vaqtga nisbatan hisoblaydi
const buildBillingState = (
  checkInAt,
  stayDays,
  now = new Date(),
  hotelSettings = {},
) => {
  const safeStayDays = Math.max(Number(stayDays || 1), 1);

  const checkoutDueAt = applyTimeToDate(
    checkInAt,
    hotelSettings.checkoutTime || "15:00",
  );
  checkoutDueAt.setDate(checkoutDueAt.getDate() + safeStayDays);

  const checkoutReminderAt = applyTimeToDate(
    checkoutDueAt,
    hotelSettings.reminderTime || "12:00",
  );

  const overdueMs = now.getTime() - checkoutDueAt.getTime();
  const extraDays = overdueMs > 0 ? Math.floor(overdueMs / DAY_MS) + 1 : 0;
  const billableDays = safeStayDays + extraDays;

  return {
    stayDays: safeStayDays,
    billableDays,
    checkoutDueAt,
    checkoutReminderAt,
  };
};

// VIP bo'lmasa qarzni qayta hisoblaydi
const recalcAmounts = (guest) => {
  if (guest.vip) {
    guest.debtAmount = 0;
    return;
  }
  const paid = Number(guest.paidAmount || 0);
  const total = Number(guest.totalAmount || 0);
  guest.debtAmount = Math.max(total - paid, 0);
};

// Sozlamadagi checkout vaqtida active mijozlarning o'tib ketgan kunlarini avtomatik oshiradi
const runOverdueBillingJob = async () => {
  const now = new Date();
  const hotelSettings = await getHotelSettings();
  const guests = await Guest.find({ status: "active" });

  for (const guest of guests) {
    const billing = buildBillingState(
      guest.checkInAt,
      guest.stayDays,
      now,
      hotelSettings,
    );
    const nextTotalAmount =
      Number(guest.dailyRate || 0) * Number(billing.billableDays || 1);

    const changed =
      Number(guest.billableDays || 0) !== Number(billing.billableDays) ||
      Number(guest.totalAmount || 0) !== Number(nextTotalAmount) ||
      new Date(guest.checkoutDueAt || 0).getTime() !==
        billing.checkoutDueAt.getTime() ||
      new Date(guest.checkoutReminderAt || 0).getTime() !==
        billing.checkoutReminderAt.getTime();

    if (!changed) continue;

    guest.billableDays = billing.billableDays;
    guest.checkoutDueAt = billing.checkoutDueAt;
    guest.checkoutReminderAt = billing.checkoutReminderAt;
    guest.totalAmount = nextTotalAmount;
    recalcAmounts(guest);
    // eslint-disable-next-line no-await-in-loop
    await guest.save();
  }
};

// Sozlamadagi ogohlantirish vaqtida active mijozlarni socketga yuboradi
const runReminderJob = async (io, targetDate) => {
  if (!io) return;

  const nowTz = targetDate ? moment(targetDate).tz(APP_TIMEZONE) : moment().tz(APP_TIMEZONE);
  const start = nowTz.clone().startOf("minute");
  const end = start.clone().add(1, "minute");

  const guests = await Guest.find({
    status: "active",
    checkoutReminderAt: { $gte: start.toDate(), $lt: end.toDate() },
  })
    .select("_id firstname lastname room checkoutReminderAt checkoutDueAt")
    .populate("room", "roomNumber floor");

  if (!guests.length) return;

  io.emit("guests_checkout_reminder", {
    type: "checkout_reminder",
    timezone: APP_TIMEZONE,
    count: guests.length,
    guests: guests.map((guest) => ({
      id: guest._id,
      fullname: `${guest.firstname} ${guest.lastname}`.trim(),
      roomNumber: guest.room?.roomNumber || "",
      floor: guest.room?.floor || null,
      checkoutReminderAt: guest.checkoutReminderAt,
      checkoutDueAt: guest.checkoutDueAt,
    })),
  });
};

// Har daqiqada tekshiradi va sozlamadagi vaqtlar bo'yicha vazifalarni bir martadan ishga tushiradi
const startGuestBillingCron = (io) => {
  const state = {
    reminderKey: "",
    overdueKey: "",
  };

  const tick = async () => {
    try {
      const nowTz = moment().tz(APP_TIMEZONE);
      const dayKey = nowTz.format("YYYY-MM-DD");
      const hour = nowTz.hour();
      const minute = nowTz.minute();
      const hotelSettings = await getHotelSettings();
      const reminder = parseTime(hotelSettings.reminderTime);
      const checkout = parseTime(hotelSettings.checkoutTime);

      if (hour === reminder.hour && minute === reminder.minute) {
        const reminderKey = `${dayKey}-${hotelSettings.reminderTime}`;
        if (state.reminderKey !== reminderKey) {
          state.reminderKey = reminderKey;
          await runReminderJob(io, nowTz.toDate());
        }
      }

      if (hour === checkout.hour && minute === checkout.minute) {
        const overdueKey = `${dayKey}-${hotelSettings.checkoutTime}`;
        if (state.overdueKey !== overdueKey) {
          state.overdueKey = overdueKey;
          await runOverdueBillingJob();
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Guest billing cron error:", error.message);
    }
  };

  // Server yoqilganda bir martalik tekshiruv
  runOverdueBillingJob().catch(() => {});
  // Har 30 sekundda vaqt triggerini tekshiradi
  const interval = setInterval(tick, 30 * 1000);
  return interval;
};

module.exports = {
  startGuestBillingCron,
};
