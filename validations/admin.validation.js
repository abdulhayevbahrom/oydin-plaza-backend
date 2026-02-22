const bootstrapAdminSchema = {
  type: "object",
  additionalProperties: false,
  required: ["firstname", "lastname", "login", "password"],
  properties: {
    firstname: { type: "string", minLength: 1 },
    lastname: { type: "string", minLength: 1 },
    login: { type: "string", minLength: 3 },
    password: { type: "string", minLength: 4 },
  },
};

const loginAdminSchema = {
  type: "object",
  additionalProperties: false,
  required: ["login", "password"],
  properties: {
    login: { type: "string", minLength: 3 },
    password: { type: "string", minLength: 4 },
  },
};

module.exports = {
  bootstrapAdminSchema,
  loginAdminSchema,
};
