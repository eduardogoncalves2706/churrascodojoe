ALTER TYPE "public"."grupo_dre" ADD VALUE 'nao_classificado';--> statement-breakpoint
CREATE TABLE "estoque_lotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"insumo_id" uuid NOT NULL,
	"origem" text DEFAULT 'compra' NOT NULL,
	"quantidade" numeric(12, 3) NOT NULL,
	"validade" date,
	"fornecedor_id" uuid,
	"custo_unitario" numeric(12, 2),
	"observacao" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "insumos" ADD COLUMN "estoque_minimo" numeric(12, 3) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "lancamentos" ADD COLUMN "extrato_ref" text;--> statement-breakpoint
ALTER TABLE "estoque_lotes" ADD CONSTRAINT "estoque_lotes_insumo_id_insumos_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_lotes" ADD CONSTRAINT "estoque_lotes_fornecedor_id_fornecedores_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_extrato_ref_uniq" UNIQUE("extrato_ref");