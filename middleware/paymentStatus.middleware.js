const Setting = require("../model/Setting");

const PAYMENT_REQUIRED_CODE = "PAYMENT_REQUIRED";
const PAYMENT_REQUIRED_MESSAGE = "Hurmatli mijoz to'lovni amalga oshiring";

const paymentStatusMiddleware = async (_, res, next) => {
  try {
    const settings = await Setting.findOne().select("status").lean();
    if (settings && settings.status === false) {
      return res.status(402).json({
        state: false,
        code: PAYMENT_REQUIRED_CODE,
        message: PAYMENT_REQUIRED_MESSAGE,
      });
    }

    return next();
  } catch (error) {
    return res.status(500).json({
      state: false,
      message: error.message,
    });
  }
};

module.exports = {
  PAYMENT_REQUIRED_CODE,
  PAYMENT_REQUIRED_MESSAGE,
  paymentStatusMiddleware,
};
