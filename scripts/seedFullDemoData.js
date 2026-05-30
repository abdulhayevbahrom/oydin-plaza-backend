require("dotenv").config();

const mongoose = require("mongoose");
const applyTimezone = require("../model/mongoose-timezone");
const Guest = require("../model/Guest");
const Room = require("../model/Room");
const Service = require("../model/Service");
const Expense = require("../model/Expense");
const HallBooking = require("../model/HallBooking");
const { getHotelSettings, applyTimeToDate } = require("../utils/hotelSettings");

mongoose.plugin(applyTimezone);

const DAY_MS = 24 * 60 * 60 * 1000;
const TEST_NOTE = "Demo ma'lumot";
const DEMO_PASSPORT_PREFIX = "DEMO-PLAZA-";
const SERVICE_PREFIX = "Demo xizmat - ";
const EXPENSE_PREFIX = "Demo xarajat - ";
const HALL_EVENT_PREFIX = "Demo tadbir - ";

const makeDate = (dayOffset, hour = 10, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
};

const makeBirthDate = (year, month, day) => {
  const d = new Date(year, month - 1, day);
  d.setHours(0, 0, 0, 0);
  return d;
};

const buildBilling = (checkInAt, stayDays, dailyRate, settings, now = new Date()) => {
  const safeStayDays = Math.max(Number(stayDays || 1), 1);
  const checkoutDueAt = applyTimeToDate(checkInAt, settings.checkoutTime || "15:00");
  checkoutDueAt.setDate(checkoutDueAt.getDate() + safeStayDays);

  const checkoutReminderAt = applyTimeToDate(
    checkoutDueAt,
    settings.reminderTime || "12:00",
  );

  const overdueMs = now.getTime() - checkoutDueAt.getTime();
  const extraDays = overdueMs > 0 ? Math.floor(overdueMs / DAY_MS) + 1 : 0;
  const billableDays = safeStayDays + extraDays;

  return {
    billableDays,
    checkoutDueAt,
    checkoutReminderAt,
    totalAmount: Number(dailyRate || 0) * billableDays,
  };
};

const syncRoomsOccupancy = async (roomIds) => {
  const objectRoomIds = [...new Set(roomIds.map(String))]
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  if (!objectRoomIds.length) return;

  const [rooms, activeCounts] = await Promise.all([
    Room.find({ _id: { $in: objectRoomIds } }).select("_id capacity status").lean(),
    Guest.aggregate([
      { $match: { status: "active", room: { $in: objectRoomIds } } },
      { $group: { _id: "$room", count: { $sum: 1 } } },
    ]),
  ]);

  const activeMap = new Map(
    activeCounts.map((item) => [String(item._id), Number(item.count || 0)]),
  );

  await Promise.all(
    rooms.map((room) => {
      const activeGuestsCount = Number(activeMap.get(String(room._id)) || 0);
      const status =
        room.status === "remont"
          ? "remont"
          : activeGuestsCount >= Number(room.capacity || 0)
            ? "band"
            : "bosh";
      return Room.updateOne({ _id: room._id }, { $set: { activeGuestsCount, status } });
    }),
  );
};

const getDailyRate = (room, guestType) =>
  guestType === "chetellik"
    ? Number(room.prices?.chetEllik || 0)
    : Number(room.prices?.oddiy || 0);

const ensureDemoServices = async () => {
  await Service.deleteMany({ name: { $regex: `^${SERVICE_PREFIX}` } });

  const docs = [
    ["Nonushta", 45000],
    ["Spa", 180000],
    ["Kir yuvish", 35000],
    ["Aeroport transfer", 220000],
    ["Kechki ovqat", 95000],
  ].map(([name, defaultPrice]) => ({
    name: `${SERVICE_PREFIX}${name}`,
    defaultPrice,
    isActive: true,
    note: TEST_NOTE,
  }));

  const inserted = await Service.insertMany(docs, { ordered: false });
  return inserted;
};

const seedGuests = async (rooms, settings, demoServices) => {
  await Guest.deleteMany({});
  const now = new Date();

  const [r1, r2, r3] = [rooms[0], rooms[1] || rooms[0], rooms[2] || rooms[0]];
  const serviceA = demoServices[0];
  const serviceB = demoServices[1] || demoServices[0];

  const templates = [
    {
      firstname: "Aziz",
      lastname: "Karimov",
      passport: `${DEMO_PASSPORT_PREFIX}001`,
      guestType: "uzb",
      phone: "+998901234001",
      birthDate: makeBirthDate(1992, 2, 12),
      room: r1,
      stayDays: 2,
      status: "active",
      checkInAt: makeDate(-1, 11, 0),
      paidPart: 0.6,
      services: [{ service: serviceA, qty: 1 }],
      vip: false,
      note: "Demo faol mehmon",
    },
    {
      firstname: "Malika",
      lastname: "Saidova",
      passport: `${DEMO_PASSPORT_PREFIX}002`,
      guestType: "chetellik",
      phone: "+447700900002",
      birthDate: makeBirthDate(1989, 7, 3),
      room: r2,
      stayDays: 3,
      status: "active",
      checkInAt: makeDate(-4, 10, 20),
      paidPart: 0.25,
      services: [{ service: serviceB, qty: 1 }],
      vip: true,
      note: "Demo qarzdor faol mehmon",
    },
    {
      firstname: "Jasur",
      lastname: "Rasulov",
      passport: `${DEMO_PASSPORT_PREFIX}003`,
      guestType: "uzb",
      phone: "+998901234003",
      birthDate: makeBirthDate(1996, 11, 19),
      room: r3,
      stayDays: 1,
      status: "booked",
      checkInAt: makeDate(1, 12, 0),
      paidPart: 0,
      services: [],
      vip: false,
      note: "Demo bron",
    },
    {
      firstname: "Dilnoza",
      lastname: "Abdullayeva",
      passport: `${DEMO_PASSPORT_PREFIX}004`,
      guestType: "uzb",
      phone: "+998901234004",
      birthDate: makeBirthDate(1994, 5, 27),
      room: r1,
      stayDays: 2,
      status: "checked_out",
      checkInAt: makeDate(-8, 9, 30),
      checkOutAt: makeDate(-6, 13, 0),
      paidPart: 1,
      services: [],
      vip: false,
      note: "Demo chiqib ketgan",
    },
    {
      firstname: "Bekzod",
      lastname: "Xolmatov",
      passport: `${DEMO_PASSPORT_PREFIX}005`,
      guestType: "chetellik",
      phone: "+905551230005",
      birthDate: makeBirthDate(1988, 1, 9),
      room: r2,
      stayDays: 4,
      status: "checked_out",
      checkInAt: makeDate(-16, 8, 0),
      checkOutAt: makeDate(-12, 14, 0),
      paidPart: 0.5,
      services: [{ service: serviceA, qty: 2 }],
      vip: false,
      note: "Demo qarzdor tarix",
    },
  ];

  const docs = templates.map((t, idx) => {
    const dailyRate = getDailyRate(t.room, t.guestType);
    const billing = buildBilling(t.checkInAt, t.stayDays, dailyRate, settings, now);
    const baseTotal = Number(billing.totalAmount || 0);
    const paidAmount =
      t.status === "booked" ? 0 : Math.floor(baseTotal * Number(t.paidPart || 0));

    const guestServices = (t.services || []).map((item) => ({
      serviceId: item.service?._id,
      name: item.service?.name || "Demo xizmat",
      price: Number(item.service?.defaultPrice || 0),
      quantity: Number(item.qty || 1),
      totalAmount: Number(item.service?.defaultPrice || 0) * Number(item.qty || 1),
      usedAt: makeDate(-Math.max(idx, 1), 16, 10),
      note: TEST_NOTE,
      createdBy: { role: "seed", login: "demo-seed" },
    }));
    const servicesTotal = guestServices.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0);
    const totalAmount = baseTotal + servicesTotal;
    const debtAmount = t.status === "booked" ? 0 : Math.max(totalAmount - paidAmount, 0);

    return {
      firstname: t.firstname,
      lastname: t.lastname,
      passport: t.passport,
      birthDate: t.birthDate,
      phone: t.phone,
      guestType: t.guestType,
      room: t.room._id,
      stayDays: t.stayDays,
      billableDays: billing.billableDays,
      checkoutReminderAt: billing.checkoutReminderAt,
      checkoutDueAt: billing.checkoutDueAt,
      dailyRate,
      totalAmount,
      paidAmount,
      debtAmount,
      payments:
        paidAmount > 0
          ? [
              {
                amount: paidAmount,
                type: idx % 2 === 0 ? "naqd" : "karta",
                note: "Demo to'lov",
                createdAt: makeDate(-Math.max(idx, 1), 18, 0),
              },
            ]
          : [],
      services: guestServices,
      status: t.status,
      bookedForAt: t.status === "booked" ? t.checkInAt : null,
      checkInAt: t.checkInAt,
      checkOutAt: t.checkOutAt || null,
      vip: Boolean(t.vip),
      note: t.note || TEST_NOTE,
    };
  });

  await Guest.insertMany(docs, { ordered: false });
  await syncRoomsOccupancy(rooms.map((r) => r._id));
};

const seedHallBookings = async () => {
  await HallBooking.deleteMany({
    $or: [
      { eventName: { $regex: `^${HALL_EVENT_PREFIX}` } },
      { note: TEST_NOTE },
    ],
  });

  const docs = [
    {
      hallName: "Grand Hall",
      eventName: `${HALL_EVENT_PREFIX}Nikoh marosimi`,
      customerFirstname: "Umid",
      customerLastname: "Aliyev",
      phone: "+998901110001",
      startDate: makeDate(2, 9),
      endDate: makeDate(2, 22),
      totalAmount: 12000000,
      paidAmount: 3000000,
      debtAmount: 9000000,
      payments: [{ amount: 3000000, type: "bank", note: "Oldindan to'lov" }],
      status: "active",
      note: TEST_NOTE,
      createdBy: { role: "seed", login: "demo-seed" },
    },
    {
      hallName: "Classic Hall",
      eventName: `${HALL_EVENT_PREFIX}Tug'ilgan kun`,
      customerFirstname: "Nodira",
      customerLastname: "Karimova",
      phone: "+998901110002",
      startDate: makeDate(-3, 10),
      endDate: makeDate(-3, 20),
      totalAmount: 6500000,
      paidAmount: 6500000,
      debtAmount: 0,
      payments: [{ amount: 6500000, type: "naqd", note: "To'liq to'lov" }],
      status: "active",
      note: TEST_NOTE,
      createdBy: { role: "seed", login: "demo-seed" },
    },
    {
      hallName: "Business Hall",
      eventName: `${HALL_EVENT_PREFIX}Seminar`,
      customerFirstname: "Sardor",
      customerLastname: "Qodirov",
      phone: "+998901110003",
      startDate: makeDate(5, 9),
      endDate: makeDate(5, 18),
      totalAmount: 5000000,
      paidAmount: 1000000,
      debtAmount: 4000000,
      payments: [{ amount: 1000000, type: "click", note: "Qisman to'lov" }],
      status: "active",
      note: TEST_NOTE,
      createdBy: { role: "seed", login: "demo-seed" },
    },
  ];

  await HallBooking.insertMany(docs, { ordered: false });
};

const seedExpenses = async () => {
  await Expense.deleteMany({ title: { $regex: `^${EXPENSE_PREFIX}` } });

  const docs = [
    ["Elektr energiyasi", "Kommunal", 1450000, "bank"],
    ["Oziq-ovqat xaridi", "Oziq-ovqat", 920000, "naqd"],
    ["Tozalash vositalari", "Xo'jalik", 340000, "karta"],
    ["Internet", "Aloqa", 270000, "click"],
    ["Texnik xizmat", "Ta'mirlash", 680000, "bank"],
  ].map(([title, category, amount, paymentType], index) => ({
    title: `${EXPENSE_PREFIX}${title}`,
    category,
    amount,
    paymentType,
    spentAt: makeDate(-index - 1, 10 + index, 15),
    note: TEST_NOTE,
    createdBy: { role: "seed", login: "demo-seed" },
  }));

  await Expense.insertMany(docs, { ordered: false });
};

const main = async () => {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI .env faylida topilmadi");

  await mongoose.connect(process.env.MONGO_URI);
  const settings = await getHotelSettings();
  const rooms = await Room.find({ status: { $ne: "remont" } }).sort({ roomNumber: 1 }).lean();

  if (!rooms.length) throw new Error("Demo seed uchun xona topilmadi");

  const demoServices = await ensureDemoServices();
  await seedGuests(rooms, settings, demoServices);
  await seedHallBookings();
  await seedExpenses();

  const [guestCount, debtorsCount, activeCount, bookedCount, checkedOutCount, serviceCount, expenseCount, hallCount] =
    await Promise.all([
      Guest.countDocuments({}),
      Guest.countDocuments({ debtAmount: { $gt: 0 } }),
      Guest.countDocuments({ status: "active" }),
      Guest.countDocuments({ status: "booked" }),
      Guest.countDocuments({ status: "checked_out" }),
      Service.countDocuments({ name: { $regex: `^${SERVICE_PREFIX}` } }),
      Expense.countDocuments({ title: { $regex: `^${EXPENSE_PREFIX}` } }),
      HallBooking.countDocuments({ eventName: { $regex: `^${HALL_EVENT_PREFIX}` } }),
    ]);

  console.log(
    JSON.stringify(
      {
        message: "Demo ma'lumotlar tayyorlandi",
        guests: { total: guestCount, active: activeCount, booked: bookedCount, checked_out: checkedOutCount, debtors: debtorsCount },
        services: serviceCount,
        expenses: expenseCount,
        hallBookings: hallCount,
      },
      null,
      2,
    ),
  );
};

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });

