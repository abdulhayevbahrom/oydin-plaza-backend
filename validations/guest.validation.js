const paymentTypes = ["naqd", "click", "bank", "karta"];

const createGuestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["firstname", "lastname", "passport", "birthDate", "room", "dailyRate", "stayDays"],
  properties: {
    firstname: { type: "string", minLength: 1 },
    lastname: { type: "string", minLength: 1 },
    passport: { type: "string", minLength: 1 },
    birthDate: { type: "string", minLength: 1 },
    phone: { type: "string" },
    guestType: { type: "string", enum: ["uzb", "chetellik"], default: "uzb" },
    isBlacklisted: { type: "boolean", default: false },
    vip: { type: "boolean", default: false },
    isBooking: { type: "boolean", default: false },
    bookedForDate: { type: "string", minLength: 1 },
    room: { type: "string", pattern: "^[0-9a-fA-F]{24}$" },
    dailyRate: { type: "number", minimum: 0 },
    stayDays: { type: "number", minimum: 1 },
    note: { type: "string" },
  },
};

const updateGuestSchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    firstname: { type: "string", minLength: 1 },
    lastname: { type: "string", minLength: 1 },
    passport: { type: "string", minLength: 1 },
    birthDate: { type: "string", minLength: 1 },
    phone: { type: "string" },
    guestType: { type: "string", enum: ["uzb", "chetellik"] },
    isBlacklisted: { type: "boolean" },
    vip: { type: "boolean" },
    dailyRate: { type: "number", minimum: 0 },
    stayDays: { type: "number", minimum: 1 },
    totalAmount: { type: "number", minimum: 0 },
    bookedForAt: { type: "string", minLength: 1 },
    note: { type: "string" },
  },
};

const guestIdParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: {
    id: { type: "string", pattern: "^[0-9a-fA-F]{24}$" },
  },
};

const guestPassportParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["passport"],
  properties: {
    passport: { type: "string", minLength: 1, maxLength: 64 },
  },
};

const addPaymentSchema = {
  type: "object",
  additionalProperties: false,
  required: ["amount", "type"],
  properties: {
    amount: { type: "number", minimum: 1, multipleOf: 1 },
    type: { type: "string", enum: paymentTypes },
    note: { type: "string" },
  },
};

const addGuestServiceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "price", "quantity"],
  properties: {
    serviceId: { type: "string", pattern: "^[0-9a-fA-F]{24}$" },
    name: { type: "string", minLength: 1 },
    price: { type: "number", minimum: 0 },
    quantity: { type: "number", minimum: 1, multipleOf: 1 },
    usedAt: { type: "string" },
    note: { type: "string" },
  },
};

const vipRequestIdParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: {
    id: { type: "string", pattern: "^[0-9a-fA-F]{24}$" },
  },
};

const decideVipRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["action"],
  properties: {
    action: { type: "string", enum: ["approve", "reject"] },
    note: { type: "string" },
  },
};

module.exports = {
  createGuestSchema,
  updateGuestSchema,
  guestIdParamsSchema,
  guestPassportParamsSchema,
  addPaymentSchema,
  addGuestServiceSchema,
  vipRequestIdParamsSchema,
  decideVipRequestSchema,
};
