const Joi = require('joi');

const taskSchema = Joi.object({
  title: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(1000).allow('').optional(),
  completed: Joi.boolean().optional(),
});

const syncSchema = Joi.object({
  last_synced_at: Joi.string().isoDate().required(),
  changes: Joi.array()
    .items(
      Joi.object({
        operation: Joi.string().valid('create', 'update', 'delete').required(),
        local_id: Joi.string().required(),
        server_id: Joi.string().optional(),
        data: Joi.object({
          title: Joi.string().min(1).max(255).optional(),
          description: Joi.string().max(1000).allow('').optional(),
          completed: Joi.boolean().optional(),
          created_at: Joi.string().isoDate().optional(),
          updated_at: Joi.string().isoDate().optional(),
          is_deleted: Joi.number().valid(0, 1).optional(),
        }).required(),
      })
    )
    .required(),
});

const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({ error: error.details.map((d) => d.message) });
  }
  next();
};

module.exports = {
  validate,
  taskSchema,
  syncSchema,
  validateTask: validate(taskSchema),
  validateSync: validate(syncSchema),
};