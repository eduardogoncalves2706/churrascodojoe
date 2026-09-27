CREATE TYPE "public"."grupo_dre" AS ENUM('receita_vendas', 'outras_receitas', 'cmv', 'custo_indireto', 'pessoal', 'entrega', 'ocupacao', 'utilidades', 'marketing', 'taxas', 'impostos', 'investimento', 'aporte_socio', 'retirada_socio', 'reserva', 'transferencia');--> statement-breakpoint
CREATE TYPE "public"."status_lancamento" AS ENUM('previsto', 'realizado', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."tipo_categoria" AS ENUM('entrada', 'saida');--> statement-breakpoint
CREATE TYPE "public"."tipo_conta" AS ENUM('caixa', 'banco', 'maquininha');--> statement-breakpoint
CREATE TYPE "public"."tipo_lancamento" AS ENUM('entrada', 'saida', 'transferencia');--> statement-breakpoint
CREATE TABLE "categorias_financeiras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"tipo" "tipo_categoria" NOT NULL,
	"grupo_dre" "grupo_dre" NOT NULL,
	"rateavel" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categorias_financeiras_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "contas_financeiras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"tipo" "tipo_conta" NOT NULL,
	"saldo_inicial" numeric(12, 2) DEFAULT '0' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contas_financeiras_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "lancamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" "tipo_lancamento" NOT NULL,
	"categoria_id" uuid NOT NULL,
	"conta_id" uuid NOT NULL,
	"conta_destino_id" uuid,
	"descricao" text NOT NULL,
	"valor" numeric(12, 2) NOT NULL,
	"data_competencia" date NOT NULL,
	"data_vencimento" date NOT NULL,
	"data_pagamento" date,
	"status" "status_lancamento" DEFAULT 'previsto' NOT NULL,
	"pedido_id" uuid,
	"fornecedor_id" uuid,
	"colaborador_id" uuid,
	"socio_id" uuid,
	"anexo_key" text,
	"recorrencia_id" uuid,
	"observacao" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "produto_custo_historico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"produto_id" uuid NOT NULL,
	"custo" numeric(12, 2) NOT NULL,
	"vigente_desde" date DEFAULT now() NOT NULL,
	"motivo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "custo_direto" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_categoria_id_categorias_financeiras_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_financeiras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_conta_id_contas_financeiras_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas_financeiras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_conta_destino_id_contas_financeiras_id_fk" FOREIGN KEY ("conta_destino_id") REFERENCES "public"."contas_financeiras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_fornecedor_id_fornecedores_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_colaborador_id_colaboradores_id_fk" FOREIGN KEY ("colaborador_id") REFERENCES "public"."colaboradores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_socio_id_socios_id_fk" FOREIGN KEY ("socio_id") REFERENCES "public"."socios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produto_custo_historico" ADD CONSTRAINT "produto_custo_historico_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_conta_id_contas_financeiras_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas_financeiras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_lancamento_id_lancamentos_id_fk" FOREIGN KEY ("lancamento_id") REFERENCES "public"."lancamentos"("id") ON DELETE no action ON UPDATE no action;