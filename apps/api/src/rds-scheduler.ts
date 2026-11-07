import { RDSClient, StartDBInstanceCommand, StopDBInstanceCommand } from '@aws-sdk/client-rds';

const rds = new RDSClient({});

/**
 * Liga/desliga o RDS por agenda (EventBridge, ver infra/lib/data-stack.ts). Fora da VPC: start/stop
 * são chamadas de plano de controle da API do RDS, não precisam alcançar o banco.
 * O negócio só atende fim de semana, então o banco fica desligado o resto da semana (~90% de economia).
 */
export const handler = async (event: { action: 'start' | 'stop' }) => {
  const id = process.env.DB_INSTANCE_ID!;
  if (event.action === 'start') await rds.send(new StartDBInstanceCommand({ DBInstanceIdentifier: id }));
  else if (event.action === 'stop') await rds.send(new StopDBInstanceCommand({ DBInstanceIdentifier: id }));
  else throw new Error(`Ação desconhecida: ${event.action}`);
  return { ok: event.action };
};
