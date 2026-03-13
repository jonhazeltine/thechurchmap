-- Crime tables migration (already applied to both dev and prod)
-- This migration file exists to sync Drizzle's migration state

CREATE TABLE "crime_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"incident_date" timestamp with time zone,
	"offense_type" text NOT NULL,
	"address" text,
	"location" "geography",
	"source" text NOT NULL,
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"case_number" text,
	"normalized_type" text,
	"tract_fips" text
);

CREATE TABLE "crime_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_ori" text NOT NULL,
	"agency_name" text NOT NULL,
	"state" text NOT NULL,
	"county" text,
	"year" integer NOT NULL,
	"population" integer,
	"violent_crime" integer DEFAULT 0,
	"property_crime" integer DEFAULT 0,
	"homicide" integer DEFAULT 0,
	"robbery" integer DEFAULT 0,
	"aggravated_assault" integer DEFAULT 0,
	"burglary" integer DEFAULT 0,
	"larceny" integer DEFAULT 0,
	"motor_vehicle_theft" integer DEFAULT 0,
	"source" text DEFAULT 'fbi_ucr' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "crime_metrics_agency_ori_year_unique" UNIQUE("agency_ori","year")
);

CREATE TABLE "ingestion_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset" text NOT NULL,
	"state" text,
	"city" text,
	"started_at" timestamp with time zone DEFAULT now(),
	"completed_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"features_fetched" integer DEFAULT 0,
	"features_inserted" integer DEFAULT 0,
	"features_updated" integer DEFAULT 0,
	"features_skipped" integer DEFAULT 0,
	"error_message" text,
	"metadata" jsonb
);
