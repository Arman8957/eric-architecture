import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class CreateMasterContractDto {
    @IsString()
    articleKey: string;

    @IsString()
    title: string;

    @IsString()
    content: string;

    @IsOptional()
    @IsNumber()
    order?: number;
}

export class UpdateMasterContractDto {
    @IsOptional()
    @IsString()
    title?: string;

    @IsOptional()
    @IsString()
    content?: string;

    @IsOptional()
    @IsNumber()
    order?: number;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}

export class SendProposalWithContractDto {
    @IsOptional()
    @IsString()
    architectSignature?: string; // base64 canvas data
}

export class ClientSignContractDto {
    @IsString()
    clientSignature: string; // base64 canvas data
}
