import { InjectRedis } from '@nestjs-modules/ioredis';
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import Redis from 'ioredis';
import { MailService } from 'src/mail/mail.service';
import { JwtService } from '@nestjs/jwt';
import { UserService } from 'src/user/user.service';
import { createHash, randomBytes } from 'node:crypto';

@Injectable()
export class AuthService {

     constructor(
        @InjectRedis() private readonly redis: Redis,
        private readonly userService: UserService,
        private readonly mailService: MailService,
        private readonly jwtService: JwtService,
    ) {}

    async sendOtp(email: string) {
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        const user = await this.userService.getOrCreate({ email: email, username: email });

        await this.redis.set(`otp:${email}`, otp, 'EX', 120);
        await this.mailService.sendUserOtp(email, otp);
        return { message: 'OTP sent to: ' + user.email };
    }

    async verifyOtp(email: string, code: string) {
        const cacheOtp = await this.redis.get(`otp:${email}`);

        if (!cacheOtp || cacheOtp !== code) {
            throw new BadRequestException('Invalid or expired OTP');
        }

        await this.redis.del(`otp:${email}`);

        const refreshToken = randomBytes(32).toString('base64url');
        const now = new Date();
        const expiresAt = new Date(now);
        expiresAt.setUTCDate(1);
        expiresAt.setUTCMonth(now.getUTCMonth() + 7);
        const lastDay = new Date(Date.UTC(expiresAt.getUTCFullYear(), expiresAt.getUTCMonth() + 1, 0)).getUTCDate();
        expiresAt.setUTCDate(Math.min(now.getUTCDate(), lastDay));

        const ttl = Math.ceil((expiresAt.getTime() - now.getTime()) / 1000);
        await this.redis.set(this.sessionKey(refreshToken), JSON.stringify({ email, expiresAt: expiresAt.getTime() }), 'EX', ttl);

        return {
            token: this.signAccessToken(email, expiresAt.getTime(), this.sessionKey(refreshToken)),
            refreshToken,
            expiresAt: expiresAt.toISOString(),
            user: { email },
        };
    }

    async getSessionAccessToken(accessToken: unknown, refreshToken: unknown) {
        let claims: { session?: string } | undefined;
        if (typeof accessToken === 'string') {
            try {
                claims = this.jwtService.verify(accessToken);
            } catch {
                // An expired access token can be renewed from the server-side session.
            }

            if (claims && !claims.session) return accessToken;
        }

        const key = this.isRefreshToken(refreshToken) ? this.sessionKey(refreshToken) : null;
        const stored = key ? await this.redis.get(key) : null;
        if (!key || !stored) {
            throw new UnauthorizedException('Session expired');
        }

        const { email, expiresAt } = JSON.parse(stored) as { email: string; expiresAt: number };
        if (expiresAt <= Date.now()) {
            throw new UnauthorizedException('Session expired');
        }

        if (claims?.session === key) return accessToken as string;
        return this.signAccessToken(email, expiresAt, key);
    }

    async revokeSession(token: unknown) {
        if (this.isRefreshToken(token)) {
            await this.redis.del(this.sessionKey(token));
        }
    }

    private isRefreshToken(token: unknown): token is string {
        return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
    }

    private sessionKey(token: string) {
        return `auth:session:${createHash('sha256').update(token).digest('hex')}`;
    }

    private signAccessToken(email: string, expiresAt: number, session: string) {
        const expiresIn = Math.min(86400, Math.ceil((expiresAt - Date.now()) / 1000));
        return this.jwtService.sign({ email, sub: 'user_id_here', session }, { expiresIn });
    }
}
