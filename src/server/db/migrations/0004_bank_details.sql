ALTER TABLE "company_members" ADD COLUMN "bank_name" text;--> statement-breakpoint
ALTER TABLE "company_members" ADD COLUMN "iban_encrypted" text;--> statement-breakpoint
ALTER TABLE "company_members" ADD COLUMN "iban_last4" text;--> statement-breakpoint
ALTER TABLE "company_members" ADD COLUMN "bank_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "company_members" ADD COLUMN "bank_updated_by" uuid;