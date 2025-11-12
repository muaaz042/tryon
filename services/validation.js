const { z } = require('zod');

const createUserSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username cannot be longer than 50 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
    
  email: z.string().email("Invalid email address"),
  
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});


const createApiKeySchema = z.object({
  name: z.string().min(3, "Key name must be at least 3 characters").max(100),
});

// Make sure to export the new schema
module.exports = { 
  createUserSchema, 
  loginSchema, 
  createApiKeySchema 
};