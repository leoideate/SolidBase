CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_company_id_name_unique" UNIQUE("company_id","name")
);
--> statement-breakpoint
ALTER TABLE "company_members" ADD COLUMN "engagement_type" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "principal" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "project_type" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "end_date" date;--> statement-breakpoint
ALTER TABLE "rates" ADD COLUMN "unit" text DEFAULT 'hour' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "middle_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mobile" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "work_entries" ADD COLUMN "break_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "work_entries" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "work_entries" ADD COLUMN "rate_unit" text DEFAULT 'hour' NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "project_dates" CHECK ("projects"."end_date" IS NULL OR "projects"."start_date" IS NULL OR "projects"."end_date" >= "projects"."start_date");--> statement-breakpoint
ALTER TABLE "work_entries" ADD CONSTRAINT "entry_break_valid" CHECK ("work_entries"."break_minutes" >= 0 AND ("work_entries"."duration_seconds" IS NULL OR "work_entries"."duration_seconds" >= 0));