import { Controller, Post, Body, Res } from '@nestjs/common';
import { AuthService } from './auth.service';

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
    ) {
        const { token, user } = await this.authService.verifyOtp(email, code);
    
        return {
            message: 'login successful',
            access_token: token,
            user
        };
    }
}
