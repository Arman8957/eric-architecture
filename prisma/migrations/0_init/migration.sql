-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."AmendmentStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "public"."AssetType" AS ENUM ('IMAGE_2D', 'DRAWING_2D', 'DOCUMENT_1D', 'MODEL_3D', 'TOUR_360', 'VIDEO');

-- CreateEnum
CREATE TYPE "public"."ClimateType" AS ENUM ('ALPINE', 'CONTINENTAL', 'TROPICAL', 'DESERT', 'POLAR', 'MARINE', 'TEMPERATE');

-- CreateEnum
CREATE TYPE "public"."ContinentType" AS ENUM ('ASIA', 'EUROPE', 'NORTH_AMERICA', 'SOUTH_AMERICA', 'AFRICA', 'AUSTRALIA');

-- CreateEnum
CREATE TYPE "public"."MediaContentType" AS ENUM ('WORLD_PROJECT', 'PORTFOLIO', 'ARTICLE', 'NEWS', 'HOME_HERO');

-- CreateEnum
CREATE TYPE "public"."MediaStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'ARCHIVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."MeetingStatus" AS ENUM ('PENDING_CLIENT_REQUEST', 'PENDING_RESPONSE', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "public"."MeetingType" AS ENUM ('INITIAL_CONSULTATION', 'PROJECT_KICKOFF', 'PHASE_PROGRESS', 'GENERAL');

-- CreateEnum
CREATE TYPE "public"."PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "public"."PaymentType" AS ENUM ('LUMP_SUM', 'INSTALLMENT');

-- CreateEnum
CREATE TYPE "public"."ProjectCategory" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'INTERIOR', 'MIXED_USE', 'TENANT_IMPROVEMENT', 'REMODEL', 'ADDITION', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."ProjectStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."ProposalStatus" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "public"."ProposalType" AS ENUM ('NORMAL', 'AMENDMENT');

-- CreateEnum
CREATE TYPE "public"."RefundStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."RequestStatus" AS ENUM ('PENDING', 'REVIEWED', 'SCHEDULED', 'COMPLETED', 'CANCELLED', 'ACTIVE');

-- CreateEnum
CREATE TYPE "public"."ServiceApprovalStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."ServiceType" AS ENUM ('NEW_CONSTRUCTION', 'RENOVATION', 'ADDITION', 'INTERIOR_DESIGN', 'LANDSCAPE_DESIGN', 'OTHER', 'TENANT_IMPROVEMENT');

-- CreateEnum
CREATE TYPE "public"."StageStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'INQUIRY', 'ACTIVE', 'BIDDING');

-- CreateEnum
CREATE TYPE "public"."TimecardStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'FINANCE', 'HIGHER_MANAGER', 'PROJECT_MANAGER', 'DRAFTER', 'EMPLOYEE', 'USER', 'MEDIA_MANAGER');

-- CreateTable
CREATE TABLE "public"."Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectRequestId" TEXT,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."_ProjectTeams" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ProjectTeams_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "public"."_TeamMembers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TeamMembers_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "public"."amendment_contracts" (
    "id" TEXT NOT NULL,
    "articleKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "amendment_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."amendment_requests" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "services" TEXT,
    "urgency" TEXT,
    "status" "public"."AmendmentStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "amendmentProposalId" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,
    "budgetRange" TEXT,
    "projectSizeUnit" TEXT,
    "squareFootage" TEXT,

    CONSTRAINT "amendment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."comments" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentId" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."contact_inquiries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isReplied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."deadline_reminders" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "deadlineType" TEXT NOT NULL,
    "deadlineDate" TIMESTAMP(3) NOT NULL,
    "reminderDate" TIMESTAMP(3) NOT NULL,
    "daysBefore" INTEGER NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deadline_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."employee_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "department" TEXT,
    "position" TEXT,
    "joinDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "phone" TEXT,
    "address" TEXT,
    "salary" DECIMAL(10,2),
    "hourlyRate" DECIMAL(10,2),
    "startingDate" TIMESTAMP(3),
    "state" TEXT,
    "taxPercentage" DECIMAL(5,2),
    "utilizationRate" DECIMAL(5,2),

    CONSTRAINT "employee_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."employee_taxes" (
    "id" TEXT NOT NULL,
    "employeeProfileId" TEXT NOT NULL,
    "taxType" TEXT NOT NULL,
    "customName" TEXT,
    "percentage" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_taxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."likes" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."master_contracts" (
    "id" TEXT NOT NULL,
    "articleKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."media_assets" (
    "id" TEXT NOT NULL,
    "mediaContentId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "type" "public"."AssetType" NOT NULL,
    "title" TEXT,
    "caption" TEXT,
    "altText" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "originalUrl" TEXT NOT NULL,
    "cdnUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "format" TEXT,
    "blurHash" TEXT,
    "sizes" JSONB,
    "streamingUrl" TEXT,
    "duration" INTEGER,
    "resolution" TEXT,
    "posterUrl" TEXT,
    "modelUrl" TEXT,
    "usdzUrl" TEXT,
    "thumbnailUrl" TEXT,
    "isProcessed" BOOLEAN NOT NULL DEFAULT false,
    "processStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."media_comment_likes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_comment_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."media_comments" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mediaContentId" TEXT NOT NULL,
    "parentId" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT true,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."media_content_tags" (
    "mediaContentId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "media_content_tags_pkey" PRIMARY KEY ("mediaContentId","tagId")
);

-- CreateTable
CREATE TABLE "public"."media_contents" (
    "id" TEXT NOT NULL,
    "contentType" "public"."MediaContentType" NOT NULL,
    "status" "public"."MediaStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" VARCHAR(500),
    "content" TEXT NOT NULL,
    "location" TEXT,
    "country" TEXT,
    "city" TEXT,
    "coordinates" JSONB,
    "projectYear" INTEGER,
    "projectArea" DOUBLE PRECISION,
    "projectClient" TEXT,
    "architect" TEXT,
    "photographer" TEXT,
    "category" "public"."ProjectCategory",
    "projectTags" TEXT[],
    "author" TEXT,
    "publishDate" TIMESTAMP(3),
    "readTime" INTEGER,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "metaKeywords" TEXT[],
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "featuredOrder" INTEGER,
    "coverImage" TEXT,
    "thumbnailImage" TEXT,
    "createdById" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "shareCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "climate" "public"."ClimateType",
    "continent" "public"."ContinentType",
    "categoryOther" TEXT,

    CONSTRAINT "media_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."media_likes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mediaContentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."media_tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."meeting_links" (
    "id" TEXT NOT NULL,
    "projectRequestId" TEXT NOT NULL,
    "sentToUserId" TEXT NOT NULL,
    "sentByUserId" TEXT NOT NULL,
    "meetingUrl" TEXT,
    "title" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "emailSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,
    "status" "public"."MeetingStatus" NOT NULL DEFAULT 'PENDING_RESPONSE',
    "stageId" TEXT,
    "endsAt" TIMESTAMP(3),
    "meetingType" "public"."MeetingType" NOT NULL DEFAULT 'GENERAL',

    CONSTRAINT "meeting_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."newsletters" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "subscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "newsletters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."overhead_expenses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "frequency" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "overhead_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."payments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectRequestId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "stageId" TEXT,
    "stageName" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "paymentType" "public"."PaymentType" NOT NULL,
    "paymentStatus" "public"."PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "stripeSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."project_assets" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "uploadedById" TEXT,
    "type" "public"."AssetType" NOT NULL,
    "title" TEXT,
    "caption" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "originalUrl" TEXT NOT NULL,
    "cdnUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "format" TEXT,
    "blurHash" TEXT,
    "altText" TEXT,
    "sizes" JSONB,
    "modelUrl" TEXT,
    "usdzUrl" TEXT,
    "thumbnailUrl" TEXT,
    "polygonCount" INTEGER,
    "hasAnimations" BOOLEAN DEFAULT false,
    "streamingUrl" TEXT,
    "duration" INTEGER,
    "resolution" TEXT,
    "pageCount" INTEGER,
    "isSearchable" BOOLEAN DEFAULT false,
    "isProcessed" BOOLEAN NOT NULL DEFAULT false,
    "processStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectRequestId" TEXT,

    CONSTRAINT "project_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."project_attachments" (
    "id" TEXT NOT NULL,
    "projectRequestId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."project_requests" (
    "id" TEXT NOT NULL,
    "clientFirstName" TEXT NOT NULL,
    "clientMiddleName" TEXT,
    "clientLastName" TEXT NOT NULL,
    "companyName" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "country" TEXT NOT NULL DEFAULT 'United States',
    "state" TEXT,
    "city" TEXT,
    "streetAddress" TEXT,
    "additionalComments" TEXT,
    "projectName" TEXT NOT NULL,
    "projectLocationSameAsClient" BOOLEAN NOT NULL DEFAULT false,
    "projectCountry" TEXT,
    "projectState" TEXT,
    "projectCity" TEXT,
    "projectStreetAddress" TEXT,
    "projectZipCode" TEXT,
    "serviceType" "public"."ServiceType" NOT NULL DEFAULT 'NEW_CONSTRUCTION',
    "projectCategory" "public"."ProjectCategory",
    "projectSize" TEXT,
    "budgetRange" TEXT,
    "preferredArchitecturalStyle" TEXT,
    "siteConstraints" TEXT,
    "sustainabilityGoals" TEXT,
    "specialRequirements" TEXT,
    "appointmentDate" TIMESTAMP(3),
    "appointmentTime" TEXT,
    "appointmentType" TEXT,
    "additionalNotes" TEXT,
    "status" "public"."RequestStatus" NOT NULL DEFAULT 'PENDING',
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "driveLink" TEXT,
    "isNewInquiry" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "archiverId" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "assignedManagerId" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "isProjectStarted" BOOLEAN NOT NULL DEFAULT false,
    "projectStartedAt" TIMESTAMP(3),
    "consultationPaymentId" TEXT,
    "aptSuiteUnit" TEXT,
    "zipCode" TEXT,
    "projectAptSuiteUnit" TEXT,
    "projectCompletedAt" TIMESTAMP(3),
    "totalDurationMonths" DOUBLE PRECISION,
    "meetingLocation" TEXT,
    "serviceTypeOther" TEXT,
    "projectCategoryOther" TEXT,

    CONSTRAINT "project_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."project_stages" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "status" "public"."StageStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "totalTasks" INTEGER NOT NULL DEFAULT 0,
    "completedTasks" INTEGER NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "assignedToId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT,
    "projectRequestId" TEXT,
    "driveLink" TEXT,
    "accumulatedTime" INTEGER NOT NULL DEFAULT 0,
    "activeTimerStart" TIMESTAMP(3),
    "externalDeadline" TIMESTAMP(3),
    "internalDeadline" TIMESTAMP(3),
    "timerUserId" TEXT,
    "clientBypassedMeeting" BOOLEAN NOT NULL DEFAULT false,
    "meetingRequired" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "project_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."project_tags" (
    "projectId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "project_tags_pkey" PRIMARY KEY ("projectId","tagId")
);

-- CreateTable
CREATE TABLE "public"."projects" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "shortDesc" VARCHAR(300),
    "category" "public"."ProjectCategory" NOT NULL,
    "status" "public"."ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "location" TEXT,
    "area" DOUBLE PRECISION,
    "completionYear" INTEGER,
    "clientName" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "metaKeywords" TEXT[],
    "coverImage" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "featuredOrder" INTEGER,
    "authorId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "proposalId" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."proposal_credits" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposal_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."proposal_services" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "rate" DECIMAL(10,2),
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "timelineWeeks" INTEGER,
    "approvalStatus" "public"."ServiceApprovalStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectionReason" TEXT,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "proposal_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."proposals" (
    "id" TEXT NOT NULL,
    "projectRequestId" TEXT NOT NULL,
    "userId" TEXT,
    "proposalNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT,
    "clientName" TEXT NOT NULL,
    "clientEmail" TEXT NOT NULL,
    "clientPhone" TEXT,
    "clientCompany" TEXT,
    "projectName" TEXT NOT NULL,
    "projectLocation" TEXT NOT NULL,
    "projectDescription" TEXT,
    "additionalContext" TEXT,
    "serviceType" "public"."ServiceType" NOT NULL,
    "projectCategory" "public"."ProjectCategory",
    "squareFootage" TEXT,
    "budgetRange" TEXT,
    "expectedTimeline" TEXT,
    "status" "public"."ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(5,2),
    "taxAmount" DECIMAL(10,2),
    "totalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "paymentMethod" TEXT,
    "paymentTerms" TEXT,
    "estimatedDuration" TEXT,
    "contactInfo" TEXT,
    "ownerSignature" TEXT,
    "ownerSignedAt" TIMESTAMP(3),
    "ownerSignedBy" TEXT,
    "architectSignature" TEXT,
    "architectSignedAt" TIMESTAMP(3),
    "architectSignedBy" TEXT,
    "notes" TEXT,
    "termsAndConditions" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT,
    "parentProposalId" TEXT,
    "proposalType" "public"."ProposalType" NOT NULL DEFAULT 'NORMAL',
    "architectContractSignature" TEXT,
    "clientContractSignature" TEXT,
    "clientContractSignedAt" TIMESTAMP(3),
    "contractSections" JSONB,
    "paymentType" "public"."PaymentType",

    CONSTRAINT "proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."refund_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectRequestId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "stageName" TEXT NOT NULL,
    "refundName" TEXT NOT NULL,
    "refundDescription" TEXT NOT NULL,
    "refundCause" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "refundStatus" "public"."RefundStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "refundProcessedAt" TIMESTAMP(3),
    "refundProcessedBy" TEXT,

    CONSTRAINT "refund_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."schedule_blocks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."site_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."teams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."timecard_billable_entries" (
    "id" TEXT NOT NULL,
    "timecardId" TEXT NOT NULL,
    "projectRequestId" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "phaseName" TEXT NOT NULL,
    "description" TEXT,
    "entryWeek" INTEGER NOT NULL DEFAULT 1,
    "monday" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "tuesday" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "wednesday" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "thursday" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "friday" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "saturday" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "sunday" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "totalHours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "proposalId" TEXT,
    "proposalNumber" TEXT,
    "stageId" TEXT,

    CONSTRAINT "timecard_billable_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."timecard_entries" (
    "id" TEXT NOT NULL,
    "timecardId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "entryWeek" INTEGER NOT NULL DEFAULT 1,
    "monday" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "tuesday" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "wednesday" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "thursday" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "friday" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "saturday" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "sunday" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "totalHours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "phaseName" TEXT,
    "projectRequestId" TEXT,
    "proposalId" TEXT,
    "proposalNumber" TEXT,
    "stageId" TEXT,

    CONSTRAINT "timecard_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."timecards" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStarting" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "weekEnding" TIMESTAMP(3) NOT NULL,
    "payPeriod" INTEGER NOT NULL DEFAULT 1,
    "payYear" INTEGER NOT NULL DEFAULT 2026,
    "status" "public"."TimecardStatus" NOT NULL DEFAULT 'DRAFT',
    "billableHours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "totalHours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "nonBillableHours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "archivedBy" TEXT,

    CONSTRAINT "timecards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_bank_details" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "routingNumber" TEXT NOT NULL,
    "branchName" TEXT,
    "bankType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_bank_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "googleId" TEXT,
    "avatar" TEXT,
    "role" "public"."UserRole" NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "password" TEXT,
    "refreshToken" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerifyToken" TEXT,
    "emailVerifyExpiry" TIMESTAMP(3),
    "bio" TEXT,
    "city" TEXT,
    "companyName" TEXT,
    "country" TEXT,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "firstName" TEXT,
    "lastName" TEXT,
    "middleInitial" TEXT,
    "phoneNumber" TEXT,
    "projectUpdates" BOOLEAN NOT NULL DEFAULT true,
    "securityAlerts" BOOLEAN NOT NULL DEFAULT true,
    "stateRegion" TEXT,
    "streetAddress" TEXT,
    "zipCode" TEXT,
    "passwordResetToken" TEXT,
    "passwordResetExpiry" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "public"."Notification"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "Notification_projectRequestId_idx" ON "public"."Notification"("projectRequestId" ASC);

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "public"."Notification"("userId" ASC);

-- CreateIndex
CREATE INDEX "_ProjectTeams_B_index" ON "public"."_ProjectTeams"("B" ASC);

-- CreateIndex
CREATE INDEX "_TeamMembers_B_index" ON "public"."_TeamMembers"("B" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "amendment_contracts_articleKey_key" ON "public"."amendment_contracts"("articleKey" ASC);

-- CreateIndex
CREATE INDEX "amendment_contracts_isActive_idx" ON "public"."amendment_contracts"("isActive" ASC);

-- CreateIndex
CREATE INDEX "amendment_contracts_order_idx" ON "public"."amendment_contracts"("order" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "amendment_requests_amendmentProposalId_key" ON "public"."amendment_requests"("amendmentProposalId" ASC);

-- CreateIndex
CREATE INDEX "amendment_requests_proposalId_idx" ON "public"."amendment_requests"("proposalId" ASC);

-- CreateIndex
CREATE INDEX "amendment_requests_requestedById_idx" ON "public"."amendment_requests"("requestedById" ASC);

-- CreateIndex
CREATE INDEX "amendment_requests_status_idx" ON "public"."amendment_requests"("status" ASC);

-- CreateIndex
CREATE INDEX "amendment_requests_userId_idx" ON "public"."amendment_requests"("userId" ASC);

-- CreateIndex
CREATE INDEX "comments_parentId_idx" ON "public"."comments"("parentId" ASC);

-- CreateIndex
CREATE INDEX "comments_projectId_idx" ON "public"."comments"("projectId" ASC);

-- CreateIndex
CREATE INDEX "comments_userId_idx" ON "public"."comments"("userId" ASC);

-- CreateIndex
CREATE INDEX "contact_inquiries_createdAt_idx" ON "public"."contact_inquiries"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "contact_inquiries_isRead_idx" ON "public"."contact_inquiries"("isRead" ASC);

-- CreateIndex
CREATE INDEX "deadline_reminders_cancelled_idx" ON "public"."deadline_reminders"("cancelled" ASC);

-- CreateIndex
CREATE INDEX "deadline_reminders_reminderDate_idx" ON "public"."deadline_reminders"("reminderDate" ASC);

-- CreateIndex
CREATE INDEX "deadline_reminders_sentAt_idx" ON "public"."deadline_reminders"("sentAt" ASC);

-- CreateIndex
CREATE INDEX "deadline_reminders_stageId_idx" ON "public"."deadline_reminders"("stageId" ASC);

-- CreateIndex
CREATE INDEX "employee_profiles_employeeId_idx" ON "public"."employee_profiles"("employeeId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "employee_profiles_employeeId_key" ON "public"."employee_profiles"("employeeId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "employee_profiles_userId_key" ON "public"."employee_profiles"("userId" ASC);

-- CreateIndex
CREATE INDEX "employee_taxes_employeeProfileId_idx" ON "public"."employee_taxes"("employeeProfileId" ASC);

-- CreateIndex
CREATE INDEX "likes_projectId_idx" ON "public"."likes"("projectId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "likes_projectId_userId_key" ON "public"."likes"("projectId" ASC, "userId" ASC);

-- CreateIndex
CREATE INDEX "likes_userId_idx" ON "public"."likes"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "master_contracts_articleKey_key" ON "public"."master_contracts"("articleKey" ASC);

-- CreateIndex
CREATE INDEX "master_contracts_isActive_idx" ON "public"."master_contracts"("isActive" ASC);

-- CreateIndex
CREATE INDEX "master_contracts_order_idx" ON "public"."master_contracts"("order" ASC);

-- CreateIndex
CREATE INDEX "media_assets_mediaContentId_idx" ON "public"."media_assets"("mediaContentId" ASC);

-- CreateIndex
CREATE INDEX "media_assets_order_idx" ON "public"."media_assets"("order" ASC);

-- CreateIndex
CREATE INDEX "media_assets_type_idx" ON "public"."media_assets"("type" ASC);

-- CreateIndex
CREATE INDEX "media_assets_uploadedById_idx" ON "public"."media_assets"("uploadedById" ASC);

-- CreateIndex
CREATE INDEX "media_comment_likes_commentId_idx" ON "public"."media_comment_likes"("commentId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "media_comment_likes_userId_commentId_key" ON "public"."media_comment_likes"("userId" ASC, "commentId" ASC);

-- CreateIndex
CREATE INDEX "media_comments_createdAt_idx" ON "public"."media_comments"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "media_comments_mediaContentId_idx" ON "public"."media_comments"("mediaContentId" ASC);

-- CreateIndex
CREATE INDEX "media_comments_parentId_idx" ON "public"."media_comments"("parentId" ASC);

-- CreateIndex
CREATE INDEX "media_comments_userId_idx" ON "public"."media_comments"("userId" ASC);

-- CreateIndex
CREATE INDEX "media_contents_city_idx" ON "public"."media_contents"("city" ASC);

-- CreateIndex
CREATE INDEX "media_contents_contentType_idx" ON "public"."media_contents"("contentType" ASC);

-- CreateIndex
CREATE INDEX "media_contents_country_idx" ON "public"."media_contents"("country" ASC);

-- CreateIndex
CREATE INDEX "media_contents_createdById_idx" ON "public"."media_contents"("createdById" ASC);

-- CreateIndex
CREATE INDEX "media_contents_isFeatured_idx" ON "public"."media_contents"("isFeatured" ASC);

-- CreateIndex
CREATE INDEX "media_contents_publishedAt_idx" ON "public"."media_contents"("publishedAt" ASC);

-- CreateIndex
CREATE INDEX "media_contents_slug_idx" ON "public"."media_contents"("slug" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "media_contents_slug_key" ON "public"."media_contents"("slug" ASC);

-- CreateIndex
CREATE INDEX "media_contents_status_idx" ON "public"."media_contents"("status" ASC);

-- CreateIndex
CREATE INDEX "media_likes_mediaContentId_idx" ON "public"."media_likes"("mediaContentId" ASC);

-- CreateIndex
CREATE INDEX "media_likes_userId_idx" ON "public"."media_likes"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "media_likes_userId_mediaContentId_key" ON "public"."media_likes"("userId" ASC, "mediaContentId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "media_tags_name_key" ON "public"."media_tags"("name" ASC);

-- CreateIndex
CREATE INDEX "media_tags_slug_idx" ON "public"."media_tags"("slug" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "media_tags_slug_key" ON "public"."media_tags"("slug" ASC);

-- CreateIndex
CREATE INDEX "meeting_links_projectRequestId_idx" ON "public"."meeting_links"("projectRequestId" ASC);

-- CreateIndex
CREATE INDEX "meeting_links_scheduledAt_idx" ON "public"."meeting_links"("scheduledAt" ASC);

-- CreateIndex
CREATE INDEX "meeting_links_sentByUserId_idx" ON "public"."meeting_links"("sentByUserId" ASC);

-- CreateIndex
CREATE INDEX "meeting_links_sentToUserId_idx" ON "public"."meeting_links"("sentToUserId" ASC);

-- CreateIndex
CREATE INDEX "meeting_links_stageId_idx" ON "public"."meeting_links"("stageId" ASC);

-- CreateIndex
CREATE INDEX "meeting_links_status_idx" ON "public"."meeting_links"("status" ASC);

-- CreateIndex
CREATE INDEX "newsletters_email_idx" ON "public"."newsletters"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "newsletters_email_key" ON "public"."newsletters"("email" ASC);

-- CreateIndex
CREATE INDEX "payments_paymentStatus_idx" ON "public"."payments"("paymentStatus" ASC);

-- CreateIndex
CREATE INDEX "payments_projectRequestId_idx" ON "public"."payments"("projectRequestId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripePaymentIntentId_key" ON "public"."payments"("stripePaymentIntentId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripeSessionId_key" ON "public"."payments"("stripeSessionId" ASC);

-- CreateIndex
CREATE INDEX "payments_userId_idx" ON "public"."payments"("userId" ASC);

-- CreateIndex
CREATE INDEX "project_assets_isProcessed_idx" ON "public"."project_assets"("isProcessed" ASC);

-- CreateIndex
CREATE INDEX "project_assets_order_idx" ON "public"."project_assets"("order" ASC);

-- CreateIndex
CREATE INDEX "project_assets_projectId_idx" ON "public"."project_assets"("projectId" ASC);

-- CreateIndex
CREATE INDEX "project_assets_projectRequestId_idx" ON "public"."project_assets"("projectRequestId" ASC);

-- CreateIndex
CREATE INDEX "project_assets_type_idx" ON "public"."project_assets"("type" ASC);

-- CreateIndex
CREATE INDEX "project_assets_uploadedById_idx" ON "public"."project_assets"("uploadedById" ASC);

-- CreateIndex
CREATE INDEX "project_attachments_projectRequestId_idx" ON "public"."project_attachments"("projectRequestId" ASC);

-- CreateIndex
CREATE INDEX "project_requests_assignedManagerId_idx" ON "public"."project_requests"("assignedManagerId" ASC);

-- CreateIndex
CREATE INDEX "project_requests_createdAt_idx" ON "public"."project_requests"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "project_requests_deletedAt_idx" ON "public"."project_requests"("deletedAt" ASC);

-- CreateIndex
CREATE INDEX "project_requests_email_idx" ON "public"."project_requests"("email" ASC);

-- CreateIndex
CREATE INDEX "project_requests_isArchived_idx" ON "public"."project_requests"("isArchived" ASC);

-- CreateIndex
CREATE INDEX "project_requests_status_idx" ON "public"."project_requests"("status" ASC);

-- CreateIndex
CREATE INDEX "project_requests_userId_idx" ON "public"."project_requests"("userId" ASC);

-- CreateIndex
CREATE INDEX "project_stages_assignedToId_idx" ON "public"."project_stages"("assignedToId" ASC);

-- CreateIndex
CREATE INDEX "project_stages_proposalId_idx" ON "public"."project_stages"("proposalId" ASC);

-- CreateIndex
CREATE INDEX "project_stages_status_idx" ON "public"."project_stages"("status" ASC);

-- CreateIndex
CREATE INDEX "projects_authorId_idx" ON "public"."projects"("authorId" ASC);

-- CreateIndex
CREATE INDEX "projects_category_idx" ON "public"."projects"("category" ASC);

-- CreateIndex
CREATE INDEX "projects_featuredOrder_idx" ON "public"."projects"("featuredOrder" ASC);

-- CreateIndex
CREATE INDEX "projects_isArchived_idx" ON "public"."projects"("isArchived" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "projects_proposalId_key" ON "public"."projects"("proposalId" ASC);

-- CreateIndex
CREATE INDEX "projects_publishedAt_idx" ON "public"."projects"("publishedAt" ASC);

-- CreateIndex
CREATE INDEX "projects_slug_idx" ON "public"."projects"("slug" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "projects_slug_key" ON "public"."projects"("slug" ASC);

-- CreateIndex
CREATE INDEX "projects_status_idx" ON "public"."projects"("status" ASC);

-- CreateIndex
CREATE INDEX "proposal_credits_proposalId_idx" ON "public"."proposal_credits"("proposalId" ASC);

-- CreateIndex
CREATE INDEX "proposal_services_approvalStatus_idx" ON "public"."proposal_services"("approvalStatus" ASC);

-- CreateIndex
CREATE INDEX "proposal_services_order_idx" ON "public"."proposal_services"("order" ASC);

-- CreateIndex
CREATE INDEX "proposal_services_proposalId_idx" ON "public"."proposal_services"("proposalId" ASC);

-- CreateIndex
CREATE INDEX "proposals_parentProposalId_idx" ON "public"."proposals"("parentProposalId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "proposals_projectId_key" ON "public"."proposals"("projectId" ASC);

-- CreateIndex
CREATE INDEX "proposals_projectRequestId_idx" ON "public"."proposals"("projectRequestId" ASC);

-- CreateIndex
CREATE INDEX "proposals_proposalNumber_idx" ON "public"."proposals"("proposalNumber" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "proposals_proposalNumber_key" ON "public"."proposals"("proposalNumber" ASC);

-- CreateIndex
CREATE INDEX "proposals_proposalType_idx" ON "public"."proposals"("proposalType" ASC);

-- CreateIndex
CREATE INDEX "proposals_status_idx" ON "public"."proposals"("status" ASC);

-- CreateIndex
CREATE INDEX "proposals_userId_idx" ON "public"."proposals"("userId" ASC);

-- CreateIndex
CREATE INDEX "refund_requests_projectRequestId_idx" ON "public"."refund_requests"("projectRequestId" ASC);

-- CreateIndex
CREATE INDEX "refund_requests_refundStatus_idx" ON "public"."refund_requests"("refundStatus" ASC);

-- CreateIndex
CREATE INDEX "refund_requests_userId_idx" ON "public"."refund_requests"("userId" ASC);

-- CreateIndex
CREATE INDEX "schedule_blocks_endAt_idx" ON "public"."schedule_blocks"("endAt" ASC);

-- CreateIndex
CREATE INDEX "schedule_blocks_startAt_idx" ON "public"."schedule_blocks"("startAt" ASC);

-- CreateIndex
CREATE INDEX "schedule_blocks_userId_idx" ON "public"."schedule_blocks"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "site_settings_key_key" ON "public"."site_settings"("key" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "public"."tags"("name" ASC);

-- CreateIndex
CREATE INDEX "tags_slug_idx" ON "public"."tags"("slug" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "tags_slug_key" ON "public"."tags"("slug" ASC);

-- CreateIndex
CREATE INDEX "timecard_billable_entries_projectRequestId_idx" ON "public"."timecard_billable_entries"("projectRequestId" ASC);

-- CreateIndex
CREATE INDEX "timecard_billable_entries_proposalId_idx" ON "public"."timecard_billable_entries"("proposalId" ASC);

-- CreateIndex
CREATE INDEX "timecard_billable_entries_timecardId_idx" ON "public"."timecard_billable_entries"("timecardId" ASC);

-- CreateIndex
CREATE INDEX "timecard_entries_projectRequestId_idx" ON "public"."timecard_entries"("projectRequestId" ASC);

-- CreateIndex
CREATE INDEX "timecard_entries_proposalId_idx" ON "public"."timecard_entries"("proposalId" ASC);

-- CreateIndex
CREATE INDEX "timecard_entries_timecardId_idx" ON "public"."timecard_entries"("timecardId" ASC);

-- CreateIndex
CREATE INDEX "timecards_isArchived_idx" ON "public"."timecards"("isArchived" ASC);

-- CreateIndex
CREATE INDEX "timecards_payPeriod_payYear_idx" ON "public"."timecards"("payPeriod" ASC, "payYear" ASC);

-- CreateIndex
CREATE INDEX "timecards_status_idx" ON "public"."timecards"("status" ASC);

-- CreateIndex
CREATE INDEX "timecards_userId_idx" ON "public"."timecards"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "timecards_userId_weekStarting_key" ON "public"."timecards"("userId" ASC, "weekStarting" ASC);

-- CreateIndex
CREATE INDEX "timecards_weekEnding_idx" ON "public"."timecards"("weekEnding" ASC);

-- CreateIndex
CREATE INDEX "user_bank_details_userId_idx" ON "public"."user_bank_details"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "user_bank_details_userId_key" ON "public"."user_bank_details"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_emailVerifyToken_key" ON "public"."users"("emailVerifyToken" ASC);

-- CreateIndex
CREATE INDEX "users_email_idx" ON "public"."users"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email" ASC);

-- CreateIndex
CREATE INDEX "users_googleId_idx" ON "public"."users"("googleId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "public"."users"("googleId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_passwordResetToken_key" ON "public"."users"("passwordResetToken" ASC);

-- CreateIndex
CREATE INDEX "users_role_idx" ON "public"."users"("role" ASC);

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_ProjectTeams" ADD CONSTRAINT "_ProjectTeams_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."project_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_ProjectTeams" ADD CONSTRAINT "_ProjectTeams_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_TeamMembers" ADD CONSTRAINT "_TeamMembers_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_TeamMembers" ADD CONSTRAINT "_TeamMembers_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."amendment_requests" ADD CONSTRAINT "amendment_requests_amendmentProposalId_fkey" FOREIGN KEY ("amendmentProposalId") REFERENCES "public"."proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."amendment_requests" ADD CONSTRAINT "amendment_requests_completedBy_fkey" FOREIGN KEY ("completedBy") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."amendment_requests" ADD CONSTRAINT "amendment_requests_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "public"."proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."amendment_requests" ADD CONSTRAINT "amendment_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."amendment_requests" ADD CONSTRAINT "amendment_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."amendment_requests" ADD CONSTRAINT "amendment_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."comments" ADD CONSTRAINT "comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."comments" ADD CONSTRAINT "comments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."comments" ADD CONSTRAINT "comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."deadline_reminders" ADD CONSTRAINT "deadline_reminders_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "public"."project_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."employee_profiles" ADD CONSTRAINT "employee_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."employee_taxes" ADD CONSTRAINT "employee_taxes_employeeProfileId_fkey" FOREIGN KEY ("employeeProfileId") REFERENCES "public"."employee_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."likes" ADD CONSTRAINT "likes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."likes" ADD CONSTRAINT "likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."media_assets" ADD CONSTRAINT "media_assets_mediaContentId_fkey" FOREIGN KEY ("mediaContentId") REFERENCES "public"."media_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."media_assets" ADD CONSTRAINT "media_assets_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."media_comment_likes" ADD CONSTRAINT "media_comment_likes_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "public"."media_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."media_comment_likes" ADD CONSTRAINT "media_comment_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."media_comments" ADD CONSTRAINT "media_comments_mediaContentId_fkey" FOREIGN KEY ("mediaContentId") REFERENCES "public"."media_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."media_comments" ADD CONSTRAINT "media_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."media_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."media_comments" ADD CONSTRAINT "media_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."media_content_tags" ADD CONSTRAINT "media_content_tags_mediaContentId_fkey" FOREIGN KEY ("mediaContentId") REFERENCES "public"."media_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."media_content_tags" ADD CONSTRAINT "media_content_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "public"."media_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."media_contents" ADD CONSTRAINT "media_contents_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."media_likes" ADD CONSTRAINT "media_likes_mediaContentId_fkey" FOREIGN KEY ("mediaContentId") REFERENCES "public"."media_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."media_likes" ADD CONSTRAINT "media_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."meeting_links" ADD CONSTRAINT "meeting_links_projectRequestId_fkey" FOREIGN KEY ("projectRequestId") REFERENCES "public"."project_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."meeting_links" ADD CONSTRAINT "meeting_links_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."meeting_links" ADD CONSTRAINT "meeting_links_sentToUserId_fkey" FOREIGN KEY ("sentToUserId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."meeting_links" ADD CONSTRAINT "meeting_links_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "public"."project_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."meeting_links" ADD CONSTRAINT "meeting_links_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payments" ADD CONSTRAINT "payments_projectRequestId_fkey" FOREIGN KEY ("projectRequestId") REFERENCES "public"."project_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payments" ADD CONSTRAINT "payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_assets" ADD CONSTRAINT "project_assets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_assets" ADD CONSTRAINT "project_assets_projectRequestId_fkey" FOREIGN KEY ("projectRequestId") REFERENCES "public"."project_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_assets" ADD CONSTRAINT "project_assets_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_attachments" ADD CONSTRAINT "project_attachments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_attachments" ADD CONSTRAINT "project_attachments_projectRequestId_fkey" FOREIGN KEY ("projectRequestId") REFERENCES "public"."project_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_requests" ADD CONSTRAINT "project_requests_assignedManagerId_fkey" FOREIGN KEY ("assignedManagerId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_requests" ADD CONSTRAINT "project_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_stages" ADD CONSTRAINT "project_stages_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_stages" ADD CONSTRAINT "project_stages_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_stages" ADD CONSTRAINT "project_stages_projectRequestId_fkey" FOREIGN KEY ("projectRequestId") REFERENCES "public"."project_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_stages" ADD CONSTRAINT "project_stages_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "public"."proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_tags" ADD CONSTRAINT "project_tags_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_tags" ADD CONSTRAINT "project_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "public"."tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."projects" ADD CONSTRAINT "projects_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."projects" ADD CONSTRAINT "projects_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "public"."proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."proposal_credits" ADD CONSTRAINT "proposal_credits_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "public"."proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."proposal_services" ADD CONSTRAINT "proposal_services_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "public"."proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."proposals" ADD CONSTRAINT "proposals_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."proposals" ADD CONSTRAINT "proposals_parentProposalId_fkey" FOREIGN KEY ("parentProposalId") REFERENCES "public"."proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."proposals" ADD CONSTRAINT "proposals_projectRequestId_fkey" FOREIGN KEY ("projectRequestId") REFERENCES "public"."project_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."proposals" ADD CONSTRAINT "proposals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."refund_requests" ADD CONSTRAINT "refund_requests_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."refund_requests" ADD CONSTRAINT "refund_requests_projectRequestId_fkey" FOREIGN KEY ("projectRequestId") REFERENCES "public"."project_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."refund_requests" ADD CONSTRAINT "refund_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."schedule_blocks" ADD CONSTRAINT "schedule_blocks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."schedule_blocks" ADD CONSTRAINT "schedule_blocks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."teams" ADD CONSTRAINT "teams_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."timecard_billable_entries" ADD CONSTRAINT "timecard_billable_entries_timecardId_fkey" FOREIGN KEY ("timecardId") REFERENCES "public"."timecards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."timecard_entries" ADD CONSTRAINT "timecard_entries_timecardId_fkey" FOREIGN KEY ("timecardId") REFERENCES "public"."timecards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."timecards" ADD CONSTRAINT "timecards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_bank_details" ADD CONSTRAINT "user_bank_details_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

