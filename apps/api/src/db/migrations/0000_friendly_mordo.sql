CREATE TYPE "public"."canal" AS ENUM('whatsapp', 'instagram', 'balcao', 'telefone', 'outro');--> statement-breakpoint
CREATE TYPE "public"."categoria_insumo" AS ENUM('carne', 'acompanhamento', 'bebida', 'limpeza', 'embalagem', 'combustivel', 'outros');--> statement-breakpoint
CREATE TYPE "public"."categoria_produto" AS ENUM('carne', 'acompanhamento', 'bebida', 'sobremesa', 'geleia', 'outros');--> statement-breakpoint
CREATE TYPE "public"."colaborador_tipo" AS ENUM('motoboy', 'ajudante', 'socio');--> statement-breakpoint
CREATE TYPE "public"."forma_pagamento" AS ENUM('pix', 'dinheiro', 'credito', 'debito', 'outro');--> statement-breakpoint
CREATE TYPE "public"."papel" AS ENUM('admin', 'operador');--> statement-breakpoint
CREATE TYPE "public"."status_pagamento" AS ENUM('pendente', 'parcial', 'pago', 'estornado');--> statement-breakpoint
CREATE TYPE "public"."status_pedido" AS ENUM('rascunho', 'confirmado', 'em_preparo', 'pronto', 'saiu_entrega', 'entregue', 'retirado', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."tipo_pedido" AS ENUM('entrega', 'retirada');--> statement-breakpoint
CREATE TABLE "bairros_entrega" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"cidade" text DEFAULT 'Canoas' NOT NULL,
	"taxa_entrega" numeric(12, 2) DEFAULT '0' NOT NULL,
	"atende" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bairros_entrega_nome_cidade_unique" UNIQUE("nome","cidade")
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"telefone" text NOT NULL,
	"instagram" text,
	"observacoes" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clientes_telefone_unique" UNIQUE("telefone")
);
--> statement-breakpoint
CREATE TABLE "colaboradores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"tipo" "colaborador_tipo" NOT NULL,
	"valor_fixo_dia" numeric(12, 2) DEFAULT '0' NOT NULL,
	"valor_por_entrega" numeric(12, 2) DEFAULT '0' NOT NULL,
	"chave_pix" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "colaboradores_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "combo_itens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"combo_id" uuid NOT NULL,
	"produto_id" uuid,
	"quantidade" numeric(12, 3) NOT NULL,
	"eh_carne_escolhida" boolean DEFAULT false NOT NULL,
	"grupo_escolha" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "combo_variantes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"combo_id" uuid NOT NULL,
	"carne_produto_id" uuid NOT NULL,
	"preco" numeric(12, 2) NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "combo_variantes_combo_id_carne_produto_id_unique" UNIQUE("combo_id","carne_produto_id")
);
--> statement-breakpoint
CREATE TABLE "combos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"pessoas" integer NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "combos_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "configuracoes" (
	"chave" text PRIMARY KEY NOT NULL,
	"valor" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enderecos_cliente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"logradouro" text NOT NULL,
	"numero" text,
	"complemento" text,
	"bairro_id" uuid,
	"referencia" text,
	"principal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ficha_tecnica" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"produto_id" uuid NOT NULL,
	"insumo_id" uuid NOT NULL,
	"quantidade_insumo" numeric(12, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ficha_tecnica_produto_id_insumo_id_unique" UNIQUE("produto_id","insumo_id")
);
--> statement-breakpoint
CREATE TABLE "fornecedores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"telefone" text,
	"prazo_pagamento_dias" integer DEFAULT 0 NOT NULL,
	"forma_pagamento_padrao" text,
	"observacoes" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fornecedores_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "insumo_custos_historico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"insumo_id" uuid NOT NULL,
	"custo" numeric(12, 2) NOT NULL,
	"fornecedor_id" uuid,
	"vigente_desde" date DEFAULT now() NOT NULL,
	"observacao" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insumos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"categoria" "categoria_insumo" NOT NULL,
	"unidade_compra" text NOT NULL,
	"custo_atual" numeric(12, 2) DEFAULT '0' NOT NULL,
	"fornecedor_padrao_id" uuid,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "insumos_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "pagamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"forma" "forma_pagamento" NOT NULL,
	"valor" numeric(12, 2) NOT NULL,
	"taxa" numeric(12, 2) DEFAULT '0' NOT NULL,
	"recebido_em" timestamp with time zone DEFAULT now() NOT NULL,
	"conta_id" uuid,
	"lancamento_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pedido_itens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"produto_id" uuid,
	"combo_variante_id" uuid,
	"descricao_snapshot" text NOT NULL,
	"quantidade" numeric(12, 3) NOT NULL,
	"preco_unitario_snapshot" numeric(12, 2) NOT NULL,
	"custo_unitario_snapshot" numeric(12, 2),
	"subtotal" numeric(12, 2) NOT NULL,
	"escolhas" jsonb,
	"observacao" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pedido_status_historico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"de" text,
	"para" text NOT NULL,
	"usuario" text,
	"nota" text,
	"em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pedidos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero_dia" integer NOT NULL,
	"data_operacao" date NOT NULL,
	"cliente_id" uuid,
	"nome_cliente_snapshot" text,
	"telefone_snapshot" text,
	"canal" "canal" DEFAULT 'whatsapp' NOT NULL,
	"tipo" "tipo_pedido" DEFAULT 'retirada' NOT NULL,
	"agendado_para" timestamp with time zone,
	"status" "status_pedido" DEFAULT 'confirmado' NOT NULL,
	"endereco_texto" text,
	"bairro_id" uuid,
	"referencia" text,
	"subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"desconto" numeric(12, 2) DEFAULT '0' NOT NULL,
	"taxa_entrega" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"custo_total" numeric(12, 2),
	"status_pagamento" "status_pagamento" DEFAULT 'pendente' NOT NULL,
	"troco_para" numeric(12, 2),
	"motoboy_id" uuid,
	"observacoes" text,
	"motivo_cancelamento" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pedidos_data_operacao_numero_dia_unique" UNIQUE("data_operacao","numero_dia")
);
--> statement-breakpoint
CREATE TABLE "produto_precos_historico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"produto_id" uuid NOT NULL,
	"preco" numeric(12, 2) NOT NULL,
	"vigente_desde" date DEFAULT now() NOT NULL,
	"motivo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "produtos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"categoria" "categoria_produto" NOT NULL,
	"unidade_venda" text DEFAULT 'unidade' NOT NULL,
	"preco_venda" numeric(12, 2) DEFAULT '0' NOT NULL,
	"permite_fracionado" boolean DEFAULT false NOT NULL,
	"parceiro" text,
	"vendido_a_preco_de_custo" boolean DEFAULT false NOT NULL,
	"disponivel_hoje" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "produtos_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "rendimento_insumo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"insumo_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"fator" numeric(8, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rendimento_insumo_insumo_id_produto_id_unique" UNIQUE("insumo_id","produto_id")
);
--> statement-breakpoint
CREATE TABLE "socios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"percentual" numeric(5, 2) NOT NULL,
	"usuario_id" uuid,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cognito_sub" text,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"papel" "papel" DEFAULT 'operador' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_cognito_sub_unique" UNIQUE("cognito_sub")
);
--> statement-breakpoint
ALTER TABLE "combo_itens" ADD CONSTRAINT "combo_itens_combo_id_combos_id_fk" FOREIGN KEY ("combo_id") REFERENCES "public"."combos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combo_itens" ADD CONSTRAINT "combo_itens_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combo_variantes" ADD CONSTRAINT "combo_variantes_combo_id_combos_id_fk" FOREIGN KEY ("combo_id") REFERENCES "public"."combos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combo_variantes" ADD CONSTRAINT "combo_variantes_carne_produto_id_produtos_id_fk" FOREIGN KEY ("carne_produto_id") REFERENCES "public"."produtos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enderecos_cliente" ADD CONSTRAINT "enderecos_cliente_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enderecos_cliente" ADD CONSTRAINT "enderecos_cliente_bairro_id_bairros_entrega_id_fk" FOREIGN KEY ("bairro_id") REFERENCES "public"."bairros_entrega"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ficha_tecnica" ADD CONSTRAINT "ficha_tecnica_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ficha_tecnica" ADD CONSTRAINT "ficha_tecnica_insumo_id_insumos_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insumo_custos_historico" ADD CONSTRAINT "insumo_custos_historico_insumo_id_insumos_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insumo_custos_historico" ADD CONSTRAINT "insumo_custos_historico_fornecedor_id_fornecedores_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insumos" ADD CONSTRAINT "insumos_fornecedor_padrao_id_fornecedores_id_fk" FOREIGN KEY ("fornecedor_padrao_id") REFERENCES "public"."fornecedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_itens" ADD CONSTRAINT "pedido_itens_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_itens" ADD CONSTRAINT "pedido_itens_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_itens" ADD CONSTRAINT "pedido_itens_combo_variante_id_combo_variantes_id_fk" FOREIGN KEY ("combo_variante_id") REFERENCES "public"."combo_variantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_status_historico" ADD CONSTRAINT "pedido_status_historico_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_bairro_id_bairros_entrega_id_fk" FOREIGN KEY ("bairro_id") REFERENCES "public"."bairros_entrega"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_motoboy_id_colaboradores_id_fk" FOREIGN KEY ("motoboy_id") REFERENCES "public"."colaboradores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produto_precos_historico" ADD CONSTRAINT "produto_precos_historico_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rendimento_insumo" ADD CONSTRAINT "rendimento_insumo_insumo_id_insumos_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rendimento_insumo" ADD CONSTRAINT "rendimento_insumo_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "socios" ADD CONSTRAINT "socios_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;