CREATE TYPE "public"."status_comissao" AS ENUM('pendente', 'paga', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."tipo_comissao" AS ENUM('percentual', 'fixo');--> statement-breakpoint
CREATE TABLE "comissoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"vendedor_id" uuid NOT NULL,
	"valor_base" numeric(12, 2) NOT NULL,
	"tipo_comissao" "tipo_comissao" NOT NULL,
	"percentual_ou_valor" numeric(12, 2) NOT NULL,
	"valor_calculado" numeric(12, 2) NOT NULL,
	"valor_final" numeric(12, 2),
	"status" "status_comissao" DEFAULT 'pendente' NOT NULL,
	"motivo_ajuste" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comissoes_pedido_id_unique" UNIQUE("pedido_id")
);
--> statement-breakpoint
CREATE TABLE "vendedores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"codigo" text NOT NULL,
	"tipo_comissao" "tipo_comissao" DEFAULT 'percentual' NOT NULL,
	"valor_comissao" numeric(12, 2) DEFAULT '0' NOT NULL,
	"usuario_email" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendedores_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "vendedor_id" uuid;--> statement-breakpoint
ALTER TABLE "comissoes" ADD CONSTRAINT "comissoes_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comissoes" ADD CONSTRAINT "comissoes_vendedor_id_vendedores_id_fk" FOREIGN KEY ("vendedor_id") REFERENCES "public"."vendedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_vendedor_id_vendedores_id_fk" FOREIGN KEY ("vendedor_id") REFERENCES "public"."vendedores"("id") ON DELETE no action ON UPDATE no action;