ALTER TABLE "email_classifications" ALTER COLUMN "needs_review" DROP DEFAULT;
ALTER TABLE "email_classifications" ALTER COLUMN "needs_review" SET DATA TYPE boolean USING needs_review::boolean;
ALTER TABLE "email_classifications" ALTER COLUMN "needs_review" SET DEFAULT false;
