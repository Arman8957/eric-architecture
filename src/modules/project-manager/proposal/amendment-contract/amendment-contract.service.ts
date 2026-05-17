import {
    Injectable,
    NotFoundException,
    Logger,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
    CreateAmendmentContractDto,
    UpdateAmendmentContractDto,
} from '../dto/amendment-contract.dto';

@Injectable()
export class AmendmentContractService {
    private readonly logger = new Logger(AmendmentContractService.name);

    constructor(private prisma: PrismaService) { }

    async findAll() {
        const articles = await this.prisma.amendmentContract.findMany({
            where: { isActive: true },
            orderBy: { order: 'asc' },
        });

        return {
            success: true,
            message: 'Amendment contract articles retrieved',
            data: articles,
        };
    }

    async findOne(id: string) {
        const article = await this.prisma.amendmentContract.findUnique({
            where: { id },
        });

        if (!article) {
            throw new NotFoundException('Article not found');
        }

        return {
            success: true,
            message: 'Article retrieved',
            data: article,
        };
    }

    async create(dto: CreateAmendmentContractDto) {
        const article = await this.prisma.amendmentContract.create({
            data: {
                articleKey: dto.articleKey,
                title: dto.title,
                content: dto.content,
                order: dto.order ?? 0,
            },
        });

        return {
            success: true,
            message: 'Amendment contract article created',
            data: article,
        };
    }

    async update(id: string, dto: UpdateAmendmentContractDto) {
        const existing = await this.prisma.amendmentContract.findUnique({
            where: { id },
        });

        if (!existing) {
            throw new NotFoundException('Article not found');
        }

        const article = await this.prisma.amendmentContract.update({
            where: { id },
            data: {
                ...(dto.title !== undefined && { title: dto.title }),
                ...(dto.content !== undefined && { content: dto.content }),
                ...(dto.order !== undefined && { order: dto.order }),
                ...(dto.isActive !== undefined && { isActive: dto.isActive }),
            },
        });

        return {
            success: true,
            message: 'Amendment contract article updated',
            data: article,
        };
    }

    async delete(id: string) {
        const existing = await this.prisma.amendmentContract.findUnique({
            where: { id },
        });

        if (!existing) {
            throw new NotFoundException('Article not found');
        }

        await this.prisma.amendmentContract.delete({ where: { id } });

        return {
            success: true,
            message: 'Amendment contract article deleted',
        };
    }

    // Seed default contract articles for amendments
    async seedDefaults() {
        const defaults = [
            {
                articleKey: 'amendment_article_1',
                title: 'Article 1 - Purpose of Amendment',
                content: `This Amendment Agreement ("Amendment") is entered into to modify the terms of the original Master Contract mentioned in the Proposal. All other terms and conditions of the Master Contract remain in full force and effect.`,
                order: 1,
            },
            {
                articleKey: 'amendment_article_2',
                title: 'Article 2 - Scope of Amended Services',
                content: 'The Architect and Owner agree to the following additional or modified services as described in this Amendment Proposal.',
                order: 2,
            }
        ];

        const results: any[] = [];
        for (const item of defaults) {
            const existing = await this.prisma.amendmentContract.findUnique({
                where: { articleKey: item.articleKey },
            });

            if (!existing) {
                const created = await this.prisma.amendmentContract.create({
                    data: item,
                });
                results.push(created);
            } else {
                results.push(existing);
            }
        }

        return {
            success: true,
            message: `Seeded ${results.length} amendment contract articles`,
            data: results,
        };
    }
}
