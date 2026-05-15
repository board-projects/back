import { InjectRedis } from '@nestjs-modules/ioredis';
import { BadRequestException, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { MailService } from 'src/mail/mail.service';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {

     constructor(
        @InjectRedis() private readonly redis: Redis,
        private readonly mailService: MailService,
        private readonly jwtService: JwtService,
    ) {}

    async sendOtp(email: string) {
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        await this.redis.set(`otp:${email}`, otp, 'EX', 120);
        await this.mailService.sendUserOtp(email, otp);
        return { message: 'OTP sent to email' };
    }

    async verifyOtp(email: string, code: string) {
        const cacheOtp = await this.redis.get(`otp:${email}`);

        if (!cacheOtp || cacheOtp !== code) {
            throw new BadRequestException('Invalid or expired OTP');
        }

        await this.redis.del(`otp:${email}`);

        const payload = { email: email, sub: 'user_id_here' };

        return {
            message: 'ورود موفقیت‌آمیز',
            access_token: this.jwtService.sign(payload),
            user: { email }
        }
    }
}
