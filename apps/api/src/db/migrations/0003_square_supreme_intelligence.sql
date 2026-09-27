ALTER TYPE "public"."canal" ADD VALUE 'site' BEFORE 'outro';--> statement-breakpoint
ALTER TYPE "public"."status_pedido" ADD VALUE 'aguardando_confirmacao' BEFORE 'rascunho';--> statement-breakpoint
ALTER TYPE "public"."status_pedido" ADD VALUE 'recusado' BEFORE 'rascunho';--> statement-breakpoint
ALTER TABLE "bairros_entrega" ADD COLUMN "visivel_site" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "combos" ADD COLUMN "descricao_curta" text;--> statement-breakpoint
ALTER TABLE "combos" ADD COLUMN "imagem_key" text;--> statement-breakpoint
ALTER TABLE "combos" ADD COLUMN "visivel_site" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "combos" ADD COLUMN "ordem_site" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "descricao_curta" text;--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "imagem_key" text;--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "visivel_site" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "destaque_site" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "ordem_site" integer DEFAULT 0 NOT NULL;