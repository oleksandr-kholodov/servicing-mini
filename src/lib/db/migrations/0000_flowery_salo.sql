CREATE TYPE "public"."event_type" AS ENUM('loan_imported', 'email_classified', 'status_changed');--> statement-breakpoint
CREATE TYPE "public"."intent" AS ENUM('promise_to_pay', 'dispute', 'hardship', 'wrong_contact', 'renewal_request', 'other');--> statement-breakpoint
CREATE TYPE "public"."loan_status" AS ENUM('current', 'delinquent', 'in_forbearance', 'paid_off', 'foreclosure');--> statement-breakpoint
CREATE TABLE "email_classifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lender_id" text NOT NULL,
	"case_id" uuid NOT NULL,
	"raw_text" text NOT NULL,
	"intent" "intent" NOT NULL,
	"promised_date" text,
	"promised_amount" numeric(14, 2),
	"confidence" numeric(4, 3) NOT NULL,
	"summary" text NOT NULL,
	"needs_review" text DEFAULT 'false' NOT NULL,
	"raw_response" jsonb,
	"provider" text DEFAULT 'stub' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lender_id" text NOT NULL,
	"case_id" uuid NOT NULL,
	"type" "event_type" NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lender_id" text NOT NULL,
	"filename" text NOT NULL,
	"checksum" text NOT NULL,
	"uploaded_by" text DEFAULT 'ui' NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"inserted" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"unchanged" integer DEFAULT 0 NOT NULL,
	"errors" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lenders" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lender_id" text NOT NULL,
	"loan_number" text NOT NULL,
	"borrower_name" text NOT NULL,
	"borrower_email" text,
	"borrower_phone" text,
	"property_address" text NOT NULL,
	"original_balance" numeric(14, 2) NOT NULL,
	"current_balance" numeric(14, 2) NOT NULL,
	"interest_rate" numeric(6, 4) NOT NULL,
	"origination_date" text NOT NULL,
	"maturity_date" text NOT NULL,
	"status" "loan_status" DEFAULT 'current' NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loans_natural_key" UNIQUE("lender_id","loan_number")
);
--> statement-breakpoint
ALTER TABLE "email_classifications" ADD CONSTRAINT "email_classifications_lender_id_lenders_id_fk" FOREIGN KEY ("lender_id") REFERENCES "public"."lenders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_classifications" ADD CONSTRAINT "email_classifications_case_id_loans_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_lender_id_lenders_id_fk" FOREIGN KEY ("lender_id") REFERENCES "public"."lenders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_case_id_loans_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_lender_id_lenders_id_fk" FOREIGN KEY ("lender_id") REFERENCES "public"."lenders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_lender_id_lenders_id_fk" FOREIGN KEY ("lender_id") REFERENCES "public"."lenders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_class_case_idx" ON "email_classifications" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "email_class_lender_idx" ON "email_classifications" USING btree ("lender_id");--> statement-breakpoint
CREATE INDEX "events_case_idx" ON "events" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "events_lender_idx" ON "events" USING btree ("lender_id");--> statement-breakpoint
CREATE INDEX "events_created_at_idx" ON "events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "import_runs_lender_idx" ON "import_runs" USING btree ("lender_id");--> statement-breakpoint
CREATE INDEX "loans_lender_idx" ON "loans" USING btree ("lender_id");