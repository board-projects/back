import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Post('send-otp')
    sendOtp(@Body('email') email: string) {
        return this.authService.sendOtp(email);
    }

    @Post('verify-otp')
    async verifyOtp(@Body('email') email: string, @Body('code') code: string) {
        const { token, user, refreshToken, expiresAt } = await this.authService.verifyOtp(email, code);

        return {
            message: 'login successful',
            access_token: token,
            refresh_token: refreshToken,
            session_expires_at: expiresAt,
            user,
        };
    }

    @Post('session')
    async session(
        @Body('access_token') accessToken: unknown,
        @Body('refresh_token') refreshToken: unknown,
    ) {
        return { access_token: await this.authService.getSessionAccessToken(accessToken, refreshToken) };
    }

    @Post('logout')
    async logout(@Body('refresh_token') token: unknown) {
        await this.authService.revokeSession(token);
        return { message: 'logout successful' };
    }
}
