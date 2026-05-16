import { Controller, Post, Body, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Response } from 'express';

@Controller('auth')
export class AuthController {

    constructor(private readonly authService: AuthService) {}

    @Post('send-otp')
    async sendOtp(@Body('email') email: string) {
        return this.authService.sendOtp(email);
    }

    @Post('verify-otp') 
    async verifyOtp(
        @Body('email') email: string, 
        @Body('code') code: string, 
        @Res({ passthrough: true }) res: Response
    ) {
        const { token, user } = await this.authService.verifyOtp(email, code);
        res.cookie('access_token', token, {
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
            domain: process.env.COOKIE_DOMAIN || 'localhost',
            maxAge: 24 * 60 * 60 * 1000, // 1 day
        });

        return {
            message: 'login successful',
            access_token: token,
            user
        };
    }
}
