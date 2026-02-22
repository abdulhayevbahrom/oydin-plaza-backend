const router = require("express").Router();
const validate = require("../middleware/validate.middleware");
const {
  createEmployeeSchema,
  updateEmployeeSchema,
  employeeIdParamsSchema,
  loginEmployeeSchema,
} = require("../validations/employee.validation");
const {
  createRoomSchema,
  updateRoomSchema,
  roomIdParamsSchema,
} = require("../validations/room.validation");
const {
  createEmployee,
  getEmployees,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
  loginEmployee,
} = require("../controllers/employee.controller");
const {
  createRoom,
  getRooms,
  getRoomById,
  updateRoom,
  deleteRoom,
} = require("../controllers/room.controller");
const {
  createGuestSchema,
  updateGuestSchema,
  guestIdParamsSchema,
  guestPassportParamsSchema,
  addPaymentSchema,
  vipRequestIdParamsSchema,
  decideVipRequestSchema,
} = require("../validations/guest.validation");
const {
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
} = require("../controllers/guest.controller");

router.post("/employee/login", validate(loginEmployeeSchema), loginEmployee);
router.post("/employee", validate(createEmployeeSchema), createEmployee);
router.get("/employees", getEmployees);
router.get(
  "/employee/:id",
  validate(employeeIdParamsSchema, "params"),
  getEmployeeById,
);
router.put(
  "/employee/:id",
  validate(employeeIdParamsSchema, "params"),
  validate(updateEmployeeSchema),
  updateEmployee,
);
router.delete(
  "/employee/:id",
  validate(employeeIdParamsSchema, "params"),
  deleteEmployee,
);
router.post("/room", validate(createRoomSchema), createRoom);
router.get("/rooms", getRooms);
router.get("/room/:id", validate(roomIdParamsSchema, "params"), getRoomById);
router.put(
  "/room/:id",
  validate(roomIdParamsSchema, "params"),
  validate(updateRoomSchema),
  updateRoom,
);
router.delete("/room/:id", validate(roomIdParamsSchema, "params"), deleteRoom);
router.post("/guest", validate(createGuestSchema), createGuest);
router.get("/guests", getGuests);
router.get("/vip-requests", getVipRequests);
router.post(
  "/vip-request/:id/decision",
  validate(vipRequestIdParamsSchema, "params"),
  validate(decideVipRequestSchema),
  decideVipRequest,
);
router.get(
  "/guest/by-passport/:passport",
  validate(guestPassportParamsSchema, "params"),
  getGuestByPassport,
);
router.get("/guest/:id", validate(guestIdParamsSchema, "params"), getGuestById);
router.put(
  "/guest/:id",
  validate(guestIdParamsSchema, "params"),
  validate(updateGuestSchema),
  updateGuest,
);
router.post(
  "/guest/:id/payment",
  validate(guestIdParamsSchema, "params"),
  validate(addPaymentSchema),
  addGuestPayment,
);
router.post(
  "/guest/:id/checkout",
  validate(guestIdParamsSchema, "params"),
  checkoutGuest,
);
router.delete("/guest/:id", validate(guestIdParamsSchema, "params"), deleteGuest);

module.exports = router;
