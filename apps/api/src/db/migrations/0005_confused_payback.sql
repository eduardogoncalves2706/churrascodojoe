ALTER TABLE "produtos" ADD COLUMN "controla_estoque" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "estoque_total" numeric(12, 3) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "estoque_venda" numeric(12, 3) DEFAULT '0' NOT NULL;