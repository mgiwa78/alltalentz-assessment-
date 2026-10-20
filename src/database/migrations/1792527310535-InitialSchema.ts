import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1792527310535 implements MigrationInterface {
    name = 'InitialSchema1792527310535'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "email" character varying(320) NOT NULL, "full_name" character varying(120) NOT NULL, "password_hash" character varying(255) NOT NULL, "role" character varying(32) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "last_login_at" TIMESTAMP WITH TIME ZONE, "sessions_revoked_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "CHK_users_role" CHECK ("role" IN ('ADMIN', 'ESTIMATOR', 'PROJECT_MANAGER')), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_users_email" ON "users" ("email") `);
        await queryRunner.query(`CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "userId" character varying, "action" character varying NOT NULL, "resourceType" character varying NOT NULL, "resourceId" character varying, "oldValues" jsonb, "newValues" jsonb, "ipAddress" character varying, "userAgent" character varying, "metadata" jsonb, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c69efb19bf127c97e6740ad530" ON "audit_logs" ("createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_cee5459245f652b75eb2759b4c" ON "audit_logs" ("action") `);
        await queryRunner.query(`CREATE INDEX "IDX_cfa83f61e4d27a87fcae1e025a" ON "audit_logs" ("userId") `);
        await queryRunner.query(`CREATE TABLE "jobs" ("id" character varying(20) NOT NULL, "job_number" integer NOT NULL, "customer_name" character varying(120) NOT NULL, "customer_email" character varying(320) NOT NULL, "property_address" character varying(300) NOT NULL, "damage_type" character varying(16) NOT NULL, "damage_description" text NOT NULL, "square_feet" integer NOT NULL, "status" character varying(32) NOT NULL DEFAULT 'NEW', "estimated_cost" numeric(12,2) NOT NULL DEFAULT '0', "labor_cost" numeric(12,2), "material_cost" numeric(12,2), "equipment_cost" numeric(12,2), "estimated_at" TIMESTAMP WITH TIME ZONE, "estimated_by_user_id" uuid, "created_by_user_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_jobs_costs" CHECK ("estimated_cost" >= 0 AND COALESCE("labor_cost", 0) >= 0 AND COALESCE("material_cost", 0) >= 0 AND COALESCE("equipment_cost", 0) >= 0), CONSTRAINT "CHK_jobs_square_feet" CHECK ("square_feet" > 0), CONSTRAINT "CHK_jobs_damage_type" CHECK ("damage_type" IN ('WATER', 'FIRE', 'MOLD', 'STORM', 'OTHER')), CONSTRAINT "CHK_jobs_status" CHECK ("status" IN ('NEW', 'INSPECTION', 'ESTIMATING', 'PROPOSAL_SENT', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')), CONSTRAINT "PK_cf0a6c42b72fcc7f7c237def345" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_jobs_created_at" ON "jobs" ("created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_jobs_damage_type" ON "jobs" ("damage_type") `);
        await queryRunner.query(`CREATE INDEX "IDX_jobs_status" ON "jobs" ("status") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_jobs_job_number" ON "jobs" ("job_number") `);
        await queryRunner.query(`CREATE TABLE "job_status_history" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "job_id" character varying(20) NOT NULL, "from_status" character varying(32), "to_status" character varying(32) NOT NULL, "changed_by_user_id" uuid, "note" character varying(1000), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_971859ffd3de1d3118837cb4d9d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_job_status_history_job_id_created_at" ON "job_status_history" ("job_id", "created_at") `);
        await queryRunner.query(`ALTER TABLE "jobs" ADD CONSTRAINT "FK_dd1d27bb2e9ac3d9e8106194ed3" FOREIGN KEY ("estimated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "jobs" ADD CONSTRAINT "FK_58d2ee149efd814cc49eb882090" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "job_status_history" ADD CONSTRAINT "FK_9b7b17a213607c7036e948701b7" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "job_status_history" ADD CONSTRAINT "FK_728687b0b034227c503a9f21423" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "job_status_history" DROP CONSTRAINT "FK_728687b0b034227c503a9f21423"`);
        await queryRunner.query(`ALTER TABLE "job_status_history" DROP CONSTRAINT "FK_9b7b17a213607c7036e948701b7"`);
        await queryRunner.query(`ALTER TABLE "jobs" DROP CONSTRAINT "FK_58d2ee149efd814cc49eb882090"`);
        await queryRunner.query(`ALTER TABLE "jobs" DROP CONSTRAINT "FK_dd1d27bb2e9ac3d9e8106194ed3"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_job_status_history_job_id_created_at"`);
        await queryRunner.query(`DROP TABLE "job_status_history"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_jobs_job_number"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_jobs_status"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_jobs_damage_type"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_jobs_created_at"`);
        await queryRunner.query(`DROP TABLE "jobs"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cfa83f61e4d27a87fcae1e025a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cee5459245f652b75eb2759b4c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c69efb19bf127c97e6740ad530"`);
        await queryRunner.query(`DROP TABLE "audit_logs"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_users_email"`);
        await queryRunner.query(`DROP TABLE "users"`);
    }

}
