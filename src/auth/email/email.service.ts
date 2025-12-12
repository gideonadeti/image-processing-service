import * as nodemailer from 'nodemailer';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    const googleAppPassword = this.configService.get<string>(
      'GOOGLE_APP_PASSWORD',
    );

    if (googleAppPassword) {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: 'gideonadeti0@gmail.com',
          pass: googleAppPassword,
        },
      });
    } else {
      this.logger.warn(
        'GOOGLE_APP_PASSWORD not configured. Email functionality will be disabled.',
      );
    }
  }

  async sendPasswordResetEmail(email: string, token: string) {
    if (!this.transporter) {
      this.logger.error('Cannot send email: Gmail not configured');
      return;
    }

    const frontendBaseUrl =
      this.configService.get<string>('FRONTEND_BASE_URL') ||
      'http://localhost:3001';
    const fromEmail = 'gideonadeti0@gmail.com';

    const resetLink = `${frontendBaseUrl}/auth/reset-password?token=${token}`;

    const mailOptions = {
      from: fromEmail,
      to: email,
      subject: 'Password Reset Request',
      html: `
        <h2>Password Reset Request</h2>
        <p>You requested to reset your password. Click the link below to reset it:</p>
        <p><a href="${resetLink}" style="background-color: #333333; color: #FAFAFA; padding: 8px 16px; text-decoration: none; border-radius: 10px; display: inline-block; font-weight: 500; font-size: 14px; transition: background-color 0.2s;">Reset Password</a></p>
        <p>Or copy and paste this link into your browser:</p>
        <p>${resetLink}</p>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `,
      text: `
        Password Reset Request
        
        You requested to reset your password. Click the link below to reset it:
        ${resetLink}
        
        This link will expire in 1 hour.
        
        If you didn't request this, please ignore this email.
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      this.logger.log(`Password reset email sent to ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send password reset email to ${email}`,
        error,
      );
      throw error;
    }
  }
}
