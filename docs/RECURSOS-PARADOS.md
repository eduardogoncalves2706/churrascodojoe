# Recursos parados em 2026-09-26 (conta 255530396736, us-east-1)

Parados para cortar custo; nada foi apagado. Para religar:

    aws ecs update-service --region us-east-1 --cluster edg-integracao-cluster --service edg-integracao-api-service --desired-count 1
    aws ecs update-service --region us-east-1 --cluster authcnpj-cluster-teste --service authcnpj-api-service --desired-count 1
    aws rds start-db-instance --region us-east-1 --db-instance-identifier edg-integracao-db
    aws rds start-db-instance --region us-east-1 --db-instance-identifier auth-teste-cnpj-db

Atenção: a AWS religa um RDS parado sozinha após 7 dias.
