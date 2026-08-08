import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateContactMessageDto {
  @IsString()
  @IsNotEmpty({ message: 'Please tell us your name' })
  @MaxLength(100)
  name!: string;

  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty()
  @MaxLength(200)
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Please write a message' })
  @MinLength(10, { message: 'Your message is a little too short' })
  @MaxLength(5000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  /**
   * Honeypot. Real users never see this field, so anything in it is a bot and
   * the request is accepted silently without sending mail.
   */
  @IsOptional()
  @IsString()
  website?: string;
}
