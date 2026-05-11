import { MailerService } from '@nestjs-modules/mailer';
import { Injectable, InternalServerErrorException } from '@nestjs/common';

@Injectable()
export class MailService {
    constructor(private readonly mailerService: MailerService) {}

    async sendUserOtp(email: string, otp: string) {
        try {
            await this.mailerService.sendMail({
                to: email,
                subject: 'Verification Code for Collaborative Board',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 10px; padding: 20px;">
                        <h2 style="color: #2563eb; text-align: center;">Welcome to Board!</h2>
                        <p style="font-size: 16px; color: #333;">Hello,</p>
                        <p style="font-size: 16px; color: #333;">Your verification code is:</p>
                        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
                        <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #1f2937;">${otp}</span>
                        </div>
                        <p style="font-size: 14px; color: #666;">This code will expire in 2 minutes.</p>
                        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                        <p style="font-size: 12px; color: #999; text-align: center;">If you didn't request this code, please ignore this email.</p>
                    </div>
                    `,
                });
        } catch (error) {
            console.error('Error sending OTP email:', error);
            throw new InternalServerErrorException('Failed to send OTP email. Please try again later.');
        }
    }
}
