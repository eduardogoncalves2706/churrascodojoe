ALTER TABLE "clientes" DROP CONSTRAINT "clientes_telefone_unique";--> statement-breakpoint
ALTER TABLE "clientes" ALTER COLUMN "telefone" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "clientes_telefone_uniq" ON "clientes" USING btree ("telefone") WHERE telefone is not null;