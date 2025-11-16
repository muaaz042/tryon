const express = require('express');

const bcrypt = require('bcryptjs');
const { z } = require('zod'); // Import Zod
const { createUserSchema ,loginSchema} = require('../services/validation'); // Import your schema
const jwt = require('jsonwebtoken'); // You'll need this


const router = express.Router();
const prisma = require('../lib/prisma');
/**
 * POST /auth/register
 * Logs in a User or an Admin
 */
router.post('/register', async (req, res, next) => {
  try {
    // 1. Validate the request body
    const validatedData = createUserSchema.parse(req.body);

    // 2. Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(validatedData.password, salt);

    // 3. Create the user in the database
    const user = await prisma.user.create({
      data: {
        name: validatedData.name,
        email: validatedData.email,
        username: validatedData.username,
        password: hashedPassword,
        // accountStatus is 'pending_verification' by default
      },
      // Select only the data that is safe to send back
      select: {
        // id: true,
        name: true,
        email: true,
        username: true,
        createdAt: true
      }
    });

    // 4. Send a success response
    res.status(201).json({ 
      message: 'User created successfully', 
      user: user 
    });

  } catch (error) {
    // Handle validation errors
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: error.flatten().fieldErrors 
      });
    }
    
    // Handle database unique constraint errors
    if (error.code === 'P2002') { // Prisma's unique constraint violation code
      let field = error.meta.target[0];
      return res.status(409).json({ 
        message: `An account with this ${field} already exists.`
      });
    }

    // Handle all other errors
    console.error('Error during registration:', error);

    next(error);
  }
});





/**
 * POST /auth/login
 * Logs in a User or an Admin
 */
router.post('/login', async (req, res, next) => {
  try {
    // 1. Validate the request body
    const { email, password } = loginSchema.parse(req.body);

    // 2. Find a user OR an admin with that email
    // We check both tables.
    let user = await prisma.user.findUnique({ where: { email } });
    let role = 'user';

    if (!user) {
      user = await prisma.admin.findUnique({ where: { email } });
      role = 'admin';
    }
    
    // 3. If no user/admin found, send error
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    
    // 4. Check if user account is active (for regular users)
    if (role === 'user' && user.accountStatus !== 'active') {
       // You might have 'pending_verification' or 'suspended'
       return res.status(403).json({ 
         message: `Account is not active. Status: ${user.accountStatus}` 
       });
    }

    // 5. Compare the provided password with the hashed password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // 6. If valid, create the JWT
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        role: role // Add the role to the token
      },
      process.env.JWT_SECRET, // Make sure JWT_SECRET is in your .env file
      { expiresIn: '1d' } // Token expires in 1 day
    );

    // 7. Send the token back
    res.json({
      message: 'Login successful',
      token: token,
      user: {
        // id: user.id,
        name: user.name,
        email: user.email,
        role: role
      }
    });

  } catch (error) {
    // Handle validation errors
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: error.flatten().fieldErrors 
      });
    }
    
    // Handle all other errors
    console.error('Error during login:', error);

    next(error);
  }
});




/**
 * GET /auth/verify-email
 * Verifies the user's token and activates the account.
 */
router.get('/verify-email', async (req, res, next) => {
    try {
        const { token } = req.query;

        if (!token) {
            return res.status(400).json({ message: "Invalid verification link." });
        }

        // Find user with this token
        const user = await prisma.user.findFirst({
            where: { verificationToken: token }
        });

        if (!user) {
            return res.status(400).json({ message: "Invalid or expired verification token." });
        }

        // Activate user and remove token
        await prisma.user.update({
            where: { id: user.id },
            data: {
                accountStatus: 'active',
                verificationToken: null // Clear the token so it can't be reused
            }
        });

        // You can redirect to a frontend success page here
        // res.redirect('http://localhost:3000/login?verified=true');
        
        // For API-only testing, send JSON
        res.status(200).json({ message: "Email verified successfully! You can now log in." });

    } catch (error) {
        next(error);
    }
});


module.exports = router;