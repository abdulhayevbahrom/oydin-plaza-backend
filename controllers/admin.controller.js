const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Admin = require("../model/Admin");
const response = require("../utils/response");

const ADMIN_SECTIONS = [
  "dashboard",
  "employees",
  "rooms",
  "guests",
  "finance",
  "reports",
];

const bootstrapAdmin = async (req, res) => {
  try {
    const { firstname, lastname, login, password } = req.body;

    const adminCount = await Admin.countDocuments();
    if (adminCount > 0) {
      return response.error(res, "Birinchi admin allaqachon yaratilgan");
    }

    const normalizedLogin = String(login).toLowerCase().trim();
    const passwordHash = await bcrypt.hash(String(password), 10);

    const admin = await Admin.create({
      firstname,
      lastname,
      login: normalizedLogin,
      password: passwordHash,
    });

    return response.created(res, "Birinchi admin yaratildi", {
      id: admin._id,
      firstname: admin.firstname,
      lastname: admin.lastname,
      login: admin.login,
    });
  } catch (error) {
    return response.serverError(res, error.message);
  }
};

const loginAdmin = async (req, res) => {
  try {
    const login = String(req.body.login).toLowerCase().trim();
    const password = String(req.body.password);

    const admin = await Admin.findOne({ login, isActive: true }).select("+password");
    if (!admin) return response.unauthorized(res, "Login yoki parol noto'g'ri");

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) return response.unauthorized(res, "Login yoki parol noto'g'ri");

    const token = jwt.sign(
      {
        id: admin._id,
        role: "admin",
        login: admin.login,
        sections: ADMIN_SECTIONS,
      },
      process.env.JWT_SECRET_KEY,
      { expiresIn: "7d" }
    );

    return response.success(res, "Muvaffaqiyatli kirildi", {
      token,
      user: {
        id: admin._id,
        firstname: admin.firstname,
        lastname: admin.lastname,
        role: "admin",
        sections: ADMIN_SECTIONS,
      },
    });
  } catch (error) {
    return response.serverError(res, error.message);
  }
};

module.exports = {
  bootstrapAdmin,
  loginAdmin,
};
