const Guest = require("../model/Guest");
const Room = require("../model/Room");
const VipRequest = require("../model/VipRequest");
const Employee = require("../model/Employee");
const response = require("../utils/response");
const {
  getHotelSettings,
  applyTimeToDate,
} = require("../utils/hotelSettings");

const DAY_MS = 24 * 60 * 60 * 1000;

const buildActionBy = async (user) => {
  if (!user) return null;

  const action = {
    userId: String(user.id || ""),
    role: String(user.role || ""),
    login: String(user.login || ""),
    firstname: "",
    lastname: "",
  };

  if (!action.userId) return action;

  const employee = await Employee.findById(action.userId)
    .select("firstname lastname")
    .lean();

  action.firstname = String(employee?.firstname || "");
  action.lastname = String(employee?.lastname || "");

  return action;
};

const canManageVip = (user) => {
  if (!user) return false;
  return String(user.role || "").toLowerCase() === "admin";
};

const escapeRegex = (value) =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
    isCheckoutReminderTime:
      now.getTime() >= checkoutReminderAt.getTime() &&
      now.getTime() < checkoutDueAt.getTime(),
    isCheckoutOverdue: overdueMs > 0,
  };
};

const recalcAmounts = (guest) => {
  if (guest.vip) {
    guest.debtAmount = 0;
    return;
  }
  const paid = Number(guest.paidAmount || 0);
  const total = Number(guest.totalAmount || 0);
  guest.debtAmount = Math.max(total - paid, 0);
};

const syncGuestBilling = async (
  guest,
  now = new Date(),
  hotelSettings = null,
) => {
  if (!guest || guest.status !== "active") return false;
  const settings = hotelSettings || (await getHotelSettings());

  const billing = buildBillingState(
    guest.checkInAt,
    guest.stayDays,
    now,
    settings,
  );
  const nextTotalAmount =
    Number(guest.dailyRate || 0) * Number(billing.billableDays || 1);

  const changed =
    Number(guest.billableDays || 0) !== Number(billing.billableDays) ||
    Number(guest.stayDays || 0) !== Number(billing.stayDays) ||
    Number(guest.totalAmount || 0) !== Number(nextTotalAmount) ||
    new Date(guest.checkoutDueAt || 0).getTime() !==
      billing.checkoutDueAt.getTime() ||
    new Date(guest.checkoutReminderAt || 0).getTime() !==
      billing.checkoutReminderAt.getTime();

  if (!changed) return false;

  guest.stayDays = billing.stayDays;
  guest.billableDays = billing.billableDays;
  guest.checkoutDueAt = billing.checkoutDueAt;
  guest.checkoutReminderAt = billing.checkoutReminderAt;
  guest.totalAmount = nextTotalAmount;
  recalcAmounts(guest);
  await guest.save();
  return true;
};

const syncAllActiveGuestsBilling = async () => {
  const hotelSettings = await getHotelSettings();
  const activeGuests = await Guest.find({ status: "active" });
  for (const guest of activeGuests) {
    // eslint-disable-next-line no-await-in-loop
    await syncGuestBilling(guest, new Date(), hotelSettings);
  }
};

const syncRoomOccupancy = async (roomId) => {
  const room = await Room.findById(roomId);
  if (!room) return;

  const activeCount = await Guest.countDocuments({
    room: room._id,
    status: "active",
  });

  room.activeGuestsCount = activeCount;
  room.status = activeCount >= room.capacity ? "band" : "bosh";
  await room.save();
};

const createGuest = async (req, res) => {
  try {
    const {
      firstname,
      lastname,
      passport,
      birthDate,
      phone,
      guestType = "uzb",
      vip = false,
      room,
      dailyRate,
      stayDays,
      note = "",
    } = req.body;

    const normalizedPassport = String(passport || "").trim();
    const blacklistedGuest = await Guest.findOne({
      passport: {
        $regex: `^${escapeRegex(normalizedPassport)}$`,
        $options: "i",
      },
      isBlacklisted: true,
    }).select("_id firstname lastname passport");
    if (blacklistedGuest) {
      return response.error(
        res,
        "Bu mijoz qora ro'yxatda. Mijozni qabul qilish mumkin emas",
      );
    }

    const roomDoc = await Room.findById(room);
    if (!roomDoc) return response.notFound(res, "Xona topilmadi");

    const activeCount = await Guest.countDocuments({ room, status: "active" });
    if (activeCount >= roomDoc.capacity) {
      return response.error(res, "Xonada bo'sh joy yo'q");
    }

    const hotelSettings = await getHotelSettings();
    const normalizedDailyRate = Number(dailyRate || 0);
    const normalizedStayDays = Math.max(Number(stayDays || 1), 1);
    const billing = buildBillingState(
      new Date(),
      normalizedStayDays,
      new Date(),
      hotelSettings,
    );

    const isVipRequested = Boolean(vip);
    const acceptedBy = await buildActionBy(req.admin);

    const guest = await Guest.create({
      firstname,
      lastname,
      passport: normalizedPassport,
      birthDate,
      phone: String(phone || "").trim(),
      guestType,
      vip: false,
      vipRequestStatus: isVipRequested ? "pending" : "none",
      vipRequestedBy: isVipRequested ? acceptedBy : null,
      room,
      stayDays: billing.stayDays,
      billableDays: billing.billableDays,
      checkoutReminderAt: billing.checkoutReminderAt,
      checkoutDueAt: billing.checkoutDueAt,
      dailyRate: normalizedDailyRate,
      totalAmount: normalizedDailyRate * billing.billableDays,
      paidAmount: 0,
      debtAmount: normalizedDailyRate * billing.billableDays,
      payments: [],
      acceptedBy,
      note,
    });

    let vipRequest = null;
    if (isVipRequested) {
      vipRequest = await VipRequest.create({
        guest: guest._id,
        status: "pending",
        requestedBy: acceptedBy,
      });

      const io = req.app.get("socket");
      if (io) {
        io.to("vip-admins").emit("vip_request_created", {
          id: vipRequest._id,
          guestId: guest._id,
          guestName: `${guest.firstname} ${guest.lastname}`,
          roomId: guest.room,
          requestedBy: acceptedBy,
          createdAt: vipRequest.createdAt,
        });
      }
    }

    await syncRoomOccupancy(roomDoc._id);

    const populated = await Guest.findById(guest._id).populate("room");
    if (vipRequest) {
      return response.created(
        res,
        "Mehmon qabul qilindi. VIP so'rovi adminga yuborildi",
        populated,
      );
    }

    return response.created(
      res,
      "Mehmon muvaffaqiyatli qabul qilindi",
      populated,
    );
  } catch (error) {
    return response.serverError(res, error.message);
  }
};

const buildGuestsPipeline = ({
  tab,
  query,
  guestType,
  vip,
  roomNumber,
  floor,
  category,
  startDate,
  endDate,
  page,
  limit,
}) => {
  const guestMatch = {};

  if (tab === "active") guestMatch.status = "active";
  if (tab === "history") guestMatch.status = "checked_out";
  if (tab === "debtors") guestMatch.debtAmount = { $gt: 0 };

  if (guestType && ["uzb", "chetellik"].includes(guestType)) {
    guestMatch.guestType = guestType;
  }

  if (vip === "true") guestMatch.vip = true;
  if (vip === "false") guestMatch.vip = false;

  if (startDate || endDate) {
    guestMatch.checkInAt = {};
    if (startDate) {
      const from = new Date(startDate);
      if (!Number.isNaN(from.getTime())) guestMatch.checkInAt.$gte = from;
    }
    if (endDate) {
      const to = new Date(endDate);
      if (!Number.isNaN(to.getTime())) {
        to.setHours(23, 59, 59, 999);
        guestMatch.checkInAt.$lte = to;
      }
    }
    if (Object.keys(guestMatch.checkInAt).length === 0)
      delete guestMatch.checkInAt;
  }

  const roomMatch = {};
  if (roomNumber)
    roomMatch["room.roomNumber"] = {
      $regex: escapeRegex(roomNumber),
      $options: "i",
    };
  if (floor !== undefined && floor !== "")
    roomMatch["room.floor"] = Number(floor);
  if (category) roomMatch["room.category"] = category;

  const search = String(query || "").trim();
  const searchMatch = search
    ? {
        $or: [
          { firstname: { $regex: escapeRegex(search), $options: "i" } },
          { lastname: { $regex: escapeRegex(search), $options: "i" } },
          { passport: { $regex: escapeRegex(search), $options: "i" } },
          { "room.roomNumber": { $regex: escapeRegex(search), $options: "i" } },
        ],
      }
    : null;

  const pipeline = [
    { $match: guestMatch },
    {
      $lookup: {
        from: "rooms",
        localField: "room",
        foreignField: "_id",
        as: "room",
      },
    },
    { $unwind: "$room" },
  ];

  if (Object.keys(roomMatch).length > 0) pipeline.push({ $match: roomMatch });
  if (searchMatch) pipeline.push({ $match: searchMatch });

  // Active ro'yxatda ogohlantirish vaqtiga kirgan mijozlar tepada chiqadi
  if (tab === "active") {
    pipeline.push({
      $addFields: {
        isCheckoutReminderTimeAgg: {
          $and: [
            { $gte: ["$$NOW", "$checkoutReminderAt"] },
            { $lt: ["$$NOW", "$checkoutDueAt"] },
          ],
        },
        isCheckoutOverdueAgg: {
          $gt: ["$$NOW", "$checkoutDueAt"],
        },
      },
    });
  }

  const sortStage =
    tab === "active"
      ? {
          isCheckoutReminderTimeAgg: -1,
          isCheckoutOverdueAgg: -1,
          createdAt: -1,
        }
      : { createdAt: -1 };

  pipeline.push(
    { $sort: sortStage },
    {
      $facet: {
        items: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        total: [{ $count: "count" }],
        floorOptions: [
          { $group: { _id: "$room.floor" } },
          { $sort: { _id: 1 } },
          { $project: { _id: 0, value: "$_id" } },
        ],
        roomNumberOptions: [
          { $group: { _id: "$room.roomNumber" } },
          { $sort: { _id: 1 } },
          { $project: { _id: 0, value: "$_id" } },
        ],
        categoryOptions: [
          { $group: { _id: "$room.category" } },
          { $sort: { _id: 1 } },
          { $project: { _id: 0, value: "$_id" } },
        ],
      },
    },
  );

  return pipeline;
};

const attachGuestRuntimeFlags = (guest) => {
  const now = Date.now();
  const checkoutReminderAt = new Date(guest.checkoutReminderAt || 0).getTime();
  const checkoutDueAt = new Date(guest.checkoutDueAt || 0).getTime();
  return {
    ...guest,
    isCheckoutReminderTime: now >= checkoutReminderAt && now < checkoutDueAt,
    isCheckoutOverdue: checkoutDueAt > 0 && now > checkoutDueAt,
  };
};

const getGuests = async (req, res) => {
  try {
    await syncAllActiveGuestsBilling();

    const tab = String(req.query.tab || "active").toLowerCase();
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 25), 1), 100);

    const pipeline = buildGuestsPipeline({
      tab,
      query: req.query.query,
      guestType: req.query.guestType,
      vip: req.query.vip,
      roomNumber: req.query.roomNumber,
      floor: req.query.floor,
      category: req.query.category,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      page,
      limit,
    });

    const [result] = await Guest.aggregate(pipeline);
    const total = Number(result?.total?.[0]?.count || 0);
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    const items = (result?.items || []).map(attachGuestRuntimeFlags);

    return response.success(res, "Mehmonlar ro'yxati", {
      items,
      filterOptions: {
        floors: (result?.floorOptions || []).map((item) => item.value),
        roomNumbers: (result?.roomNumberOptions || []).map(
          (item) => item.value,
        ),
        categories: (result?.categoryOptions || []).map((item) => item.value),
      },
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    return response.serverError(res, error.message);
  }
};

const getGuestById = async (req, res) => {
  try {
    const guest = await Guest.findById(req.params.id).populate("room");
    if (!guest) return response.notFound(res, "Mehmon topilmadi");
    if (guest.status === "active") await syncGuestBilling(guest);

    const next = await Guest.findById(req.params.id).populate("room").lean();
    return response.success(
      res,
      "Mehmon ma'lumotlari",
      attachGuestRuntimeFlags(next),
    );
  } catch (error) {
    return response.serverError(res, error.message);
  }
};

const getGuestByPassport = async (req, res) => {
  try {
    const passport = String(req.params.passport || "").trim();
    if (!passport) return response.error(res, "Passport majburiy");

    const guest = await Guest.findOne({
      passport: { $regex: `^${escapeRegex(passport)}$`, $options: "i" },
    })
      .sort({ createdAt: -1 })
      .select("firstname lastname phone birthDate passport isBlacklisted");

    if (!guest)
      return response.notFound(res, "Passport bo'yicha mehmon topilmadi");

    return response.success(res, "Passport bo'yicha ma'lumot topildi", guest);
  } catch (error) {
    return response.serverError(res, error.message);
  }
};

const updateGuest = async (req, res) => {
  try {
    const guest = await Guest.findById(req.params.id);
    if (!guest) return response.notFound(res, "Mehmon topilmadi");
    const previousRoomId = String(guest.room);

    if (Object.prototype.hasOwnProperty.call(req.body, "vipRequestStatus")) {
      return response.error(
        res,
        "VIP so'rov holatini to'g'ridan-to'g'ri o'zgartirib bo'lmaydi",
      );
    }

    const updates = { ...req.body };
    const wantsVipRequest = Object.prototype.hasOwnProperty.call(updates, "vip")
      ? Boolean(updates.vip)
      : false;
    delete updates.vip;

    Object.assign(guest, updates);

    if (Object.prototype.hasOwnProperty.call(req.body, "stayDays")) {
      guest.stayDays = Math.max(Number(req.body.stayDays || 1), 1);
    }

    if (wantsVipRequest && !guest.vip && guest.vipRequestStatus !== "pending") {
      const requestedBy = await buildActionBy(req.admin);
      guest.vipRequestStatus = "pending";
      guest.vipRequestedBy = requestedBy;

      const vipRequest = await VipRequest.create({
        guest: guest._id,
        status: "pending",
        requestedBy,
      });

      const io = req.app.get("socket");
      if (io) {
        io.to("vip-admins").emit("vip_request_created", {
          id: vipRequest._id,
          guestId: guest._id,
          guestName: `${guest.firstname} ${guest.lastname}`,
          roomId: guest.room,
          requestedBy,
          createdAt: vipRequest.createdAt,
        });
      }
    }

    if (guest.status === "active") {
      const billingChanged = await syncGuestBilling(guest);
      if (!billingChanged) {
        await guest.save();
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(req.body, "dailyRate") &&
      guest.status !== "active"
    ) {
      guest.totalAmount =
        Number(req.body.dailyRate || 0) *
        Math.max(Number(guest.billableDays || 1), 1);
      recalcAmounts(guest);
      await guest.save();
    }

    if (
      guest.status !== "active" &&
      !Object.prototype.hasOwnProperty.call(req.body, "dailyRate")
    ) {
      await guest.save();
    }

    const nextRoomId = String(guest.room);
    if (previousRoomId !== nextRoomId) {
      await syncRoomOccupancy(previousRoomId);
    }
    await syncRoomOccupancy(nextRoomId);

    const populated = await Guest.findById(guest._id).populate("room").lean();
    return response.success(
      res,
      "Mehmon ma'lumotlari yangilandi",
      attachGuestRuntimeFlags(populated),
    );
  } catch (error) {
    return response.serverError(res, error.message);
  }
};

const getVipRequests = async (req, res) => {
  try {
    if (!canManageVip(req.admin)) {
      return response.forbidden(res, "VIP so'rovlarni ko'rishga ruxsat yo'q");
    }

    const status = String(req.query.status || "pending").toLowerCase();
    const filter = {};
    if (["pending", "approved", "rejected"].includes(status)) {
      filter.status = status;
    }

    const requests = await VipRequest.find(filter)
      .populate({
        path: "guest",
        populate: { path: "room", select: "roomNumber" },
      })
      .sort({ createdAt: -1 });

    return response.success(res, "VIP so'rovlar ro'yxati", requests);
  } catch (error) {
    return response.serverError(res, error.message);
  }
};

const decideVipRequest = async (req, res) => {
  try {
    if (!canManageVip(req.admin)) {
      return response.forbidden(res, "VIP so'rovni tasdiqlashga ruxsat yo'q");
    }

    const action = String(req.body.action || "").toLowerCase();
    if (!["approve", "reject"].includes(action)) {
      return response.error(res, "action approve yoki reject bo'lishi kerak");
    }

    const request = await VipRequest.findById(req.params.id);
    if (!request) return response.notFound(res, "VIP so'rov topilmadi");
    if (request.status !== "pending") {
      return response.error(res, "VIP so'rov allaqachon ko'rib chiqilgan");
    }

    const guest = await Guest.findById(request.guest);
    if (!guest) return response.notFound(res, "Bog'langan mehmon topilmadi");

    const decisionBy = await buildActionBy(req.admin);
    request.status = action === "approve" ? "approved" : "rejected";
    request.decidedBy = decisionBy;
    request.decidedAt = new Date();
    request.note = String(req.body.note || "").trim();
    await request.save();

    if (action === "approve") {
      guest.vip = true;
      guest.vipRequestStatus = "approved";
      guest.vipApprovedBy = decisionBy;
      guest.vipApprovedAt = new Date();
      guest.paidAmount = 0;
      guest.payments = [];
      guest.debtAmount = 0;
    } else {
      guest.vip = false;
      guest.vipRequestStatus = "rejected";
      guest.vipApprovedBy = null;
      guest.vipApprovedAt = null;
      recalcAmounts(guest);
    }

    await guest.save();

    const io = req.app.get("socket");
    if (io) {
      // Adminlar uchun VIP so'rov yangilanishi
      io.to("vip-admins").emit("vip_request_updated", {
        id: request._id,
        guestId: guest._id,
        status: request.status,
        decidedBy: decisionBy,
        decidedAt: request.decidedAt,
      });

      // Barcha ulangan klientlarga mehmon holati yangilangani haqida signal
      io.emit("guest_updated", {
        guestId: String(guest._id),
        reason: "vip_decision",
        vip: guest.vip,
        vipRequestStatus: guest.vipRequestStatus,
        debtAmount: guest.debtAmount,
      });
    }

    const populatedGuest = await Guest.findById(guest._id).populate("room");
    return response.success(
      res,
      action === "approve" ? "VIP so'rov tasdiqlandi" : "VIP so'rov rad etildi",
      {
        request,
        guest: populatedGuest,
      },
    );
  } catch (error) {
    return response.serverError(res, error.message);
  }
};

const addGuestPayment = async (req, res) => {
  try {
    const { amount, type, note = "" } = req.body;
    const guest = await Guest.findById(req.params.id);
    if (!guest) return response.notFound(res, "Mehmon topilmadi");
    // if (guest.status !== "active") return response.error(res, "Faqat active mehmon uchun to'lov qo'shiladi");
    if (guest.vip)
      return response.error(res, "VIP mehmon uchun to'lov olinmaydi");

    await syncGuestBilling(guest);

    guest.payments.push({ amount: Number(amount), type, note });
    guest.paidAmount = Number(guest.paidAmount || 0) + Number(amount);
    recalcAmounts(guest);
    await guest.save();

    const populated = await Guest.findById(guest._id).populate("room").lean();
    return response.success(
      res,
      "To'lov qo'shildi",
      attachGuestRuntimeFlags(populated),
    );
  } catch (error) {
    return response.serverError(res, error.message);
  }
};

const checkoutGuest = async (req, res) => {
  try {
    const guest = await Guest.findById(req.params.id);
    if (!guest) return response.notFound(res, "Mehmon topilmadi");
    if (guest.status === "checked_out") {
      return response.error(res, "Mehmon allaqachon checkout qilingan");
    }

    await syncGuestBilling(guest);

    guest.status = "checked_out";
    guest.checkoutBy = await buildActionBy(req.admin);
    guest.checkOutAt = new Date();
    await guest.save();

    await syncRoomOccupancy(guest.room);

    const populated = await Guest.findById(guest._id).populate("room").lean();
    return response.success(
      res,
      "Mehmon checkout qilindi",
      attachGuestRuntimeFlags(populated),
    );
  } catch (error) {
    return response.serverError(res, error.message);
  }
};

const deleteGuest = async (req, res) => {
  try {
    if (String(req?.admin?.role || "").toLowerCase() !== "manager") {
      return response.forbidden(res, "Mehmonni faqat manager o'chira oladi");
    }

    const guest = await Guest.findByIdAndDelete(req.params.id);
    if (!guest) return response.notFound(res, "Mehmon topilmadi");

    await VipRequest.deleteMany({ guest: guest._id });

    if (guest.status === "active") {
      await syncRoomOccupancy(guest.room);
    }

    return response.success(res, "Mehmon o'chirildi");
  } catch (error) {
    return response.serverError(res, error.message);
  }
};

module.exports = {
  createGuest,
  getGuests,
  getGuestById,
  getGuestByPassport,
  getVipRequests,
  decideVipRequest,
  updateGuest,
  addGuestPayment,
  checkoutGuest,
  deleteGuest,
};
