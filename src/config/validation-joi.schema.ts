import * as Joi from 'joi';

const validationSchema = Joi.object({
  PORT: Joi.number().default(3000),

  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  DATABASE_URL: Joi.string().uri().required(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES: Joi.string().default('15m'),

  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRES: Joi.string().default('7d'),

  SMTP_HOST: Joi.string().required(),
  SMTP_PORT: Joi.number().required(),
  SMTP_USER: Joi.string().email().required(),
  SMTP_PASS: Joi.string().required(),

  MAIL_FROM: Joi.string().email().optional(),
  MAIL_FROM_NAME: Joi.string().optional(),
  EMAIL_VERIFY_EXPIRY: Joi.string().default('24'),

  GOOGLE_CLIENT_ID: Joi.string().required(),
  GOOGLE_CLIENT_SECRET: Joi.string().required(),
  GOOGLE_CALLBACK_URL: Joi.string().uri().required(),

  CLOUDINARY_CLOUD_NAME: Joi.string().required(),
  CLOUDINARY_API_KEY: Joi.string().required(),
  CLOUDINARY_API_SECRET: Joi.string().required(),

  FRONTEND_URL: Joi.string()
    .uri()
    .default('http://localhost:3001'),
});

export default validationSchema;
