import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ContactService } from './contact.service';
import { CreateContactMessageDto } from './dto/create-contact.dto';

/**
 * Public endpoint — the contact form is on the marketing site and has no auth.
 * The global rate limiter in main.ts applies.
 */
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async submit(@Body() dto: CreateContactMessageDto) {
    return this.contactService.submit(dto);
  }
}
