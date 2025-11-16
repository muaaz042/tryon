const nodemailer = require('nodemailer');

/**
 * Sends a verification email to the user.
 * Uses an Ethereal test account if no real SMTP vars are provided.
 */
const sendVerificationEmail = async (toEmail, token) => {
  try {
    // 1. Create Transporter
    // If you have real credentials in .env, use them. Otherwise use Ethereal for testing.
    let transporter;
    
    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT || 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });
    } else {
        // Generate test SMTP service account from ethereal.email
        const testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
            host: "smtp.ethereal.email",
            port: 587,
            secure: false,
            auth: {
                user: testAccount.user, 
                pass: testAccount.pass, 
            },
        });
        console.log('\n[EMAIL DEBUG] Using Ethereal Test Account');
    }

    // 2. Build Verification Link
    // Assuming server runs on localhost:5000
    const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
    const verificationUrl = `${baseUrl}/auth/verify-email?token=${token}`;

    // 3. Send Email
    const info = await transporter.sendMail({
      from: '"VTryOn App" <no-reply@vtryon.com>', 
      to: toEmail, 
      subject: "Verify your email address", 
      text: `Please verify your account by clicking the following link: ${verificationUrl}`, 
      html: `
        <h3>Welcome to VTryOn!</h3>
        <p>Please verify your account by clicking the link below:</p>
        <a href="${verificationUrl}">Verify Email</a>
        <br>
        <p>If you did not request this, please ignore this email.</p>
      `, 
    });

    console.log(`\n[EMAIL SENT] Message ID: ${info.messageId}`);
    
    // If using Ethereal, log the preview URL so you can "click" it manually
    if (nodemailer.getTestMessageUrl(info)) {
        console.log(`[EMAIL PREVIEW] Click here to verify: ${nodemailer.getTestMessageUrl(info)}`);
        console.log(`[DIRECT LINK] ${verificationUrl}\n`);
    }

  } catch (error) {
    console.error("Error sending verification email:", error);
  }
};

module.exports = { sendVerificationEmail };