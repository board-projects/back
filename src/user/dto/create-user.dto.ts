import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator'

export class CreateUserDto {
    @IsString({ message: 'َUsername must be a string' })
    username: string;

    @IsEmail({}, { message: 'Please enter a valid email address' })
    email: string
}