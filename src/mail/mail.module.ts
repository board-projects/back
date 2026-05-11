import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { MailService } from './mail.service';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
    imports: [
        ConfigModule.forRoot(),
        MailerModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: async (configService: ConfigService) => ({
                transport: {
                    host: 'smtp.gmail.com',
                    port: 587,
                    secure: false,
                    auth: {
                        user: configService.get('GMAIL_USER'),
                        pass: configService.get('GMAIL_PASS'),
                    }       
                },
                defaults: {
                    from: `"Board App" <${configService.get('GMAIL_USER')}>`,
                },
            }),
            inject: [ConfigService],
        })
    ],
    providers: [MailService],
    exports: [MailService],
})
export class MailModule {}
