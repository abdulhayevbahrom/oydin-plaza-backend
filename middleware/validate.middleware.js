const Ajv = require("ajv");
const response = require("../utils/response");

const ajv = new Ajv({
  allErrors: true,
  removeAdditional: true,
  useDefaults: true,
  coerceTypes: true,
});

const formatError = (error) => {
  const field = error.instancePath ? error.instancePath.replace("/", "") : "";
  if (error.keyword === "required") return `${error.params.missingProperty} majburiy`;
  if (!field) return error.message || "Validation xato";
  return `${field}: ${error.message}`;
};

const validate = (schema, source = "body") => {
  const validateSchema = ajv.compile(schema);

  return (req, res, next) => {
    const valid = validateSchema(req[source]);
    if (valid) return next();

    const errors = validateSchema.errors || [];
    return response.error(
      res,
      "Validation xato",
      errors.map(formatError)
    );
  };
};

module.exports = validate;
