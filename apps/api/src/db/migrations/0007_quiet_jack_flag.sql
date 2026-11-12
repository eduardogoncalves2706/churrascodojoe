CREATE TABLE "produto_variantes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"produto_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"preco_venda" numeric(12, 2) NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "produto_variantes_produto_id_nome_unique" UNIQUE("produto_id","nome")
);
--> statement-breakpoint
ALTER TABLE "pedido_itens" ADD COLUMN "produto_variante_id" uuid;--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "atributos_extra" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "produto_variantes" ADD CONSTRAINT "produto_variantes_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_itens" ADD CONSTRAINT "pedido_itens_produto_variante_id_produto_variantes_id_fk" FOREIGN KEY ("produto_variante_id") REFERENCES "public"."produto_variantes"("id") ON DELETE no action ON UPDATE no action;