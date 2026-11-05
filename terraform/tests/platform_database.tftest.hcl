mock_provider "aws" {}

variables {
  lambdasVersion                = "local"
  CODE_VERSION                  = "test-version"
  GATEWAY_GLOBAL_SIGNING_SECRET = "test-secret"
  GATEWAY_BRAZIL_ACCESS_TOKEN   = "test-token"
  DATABASE_ADMIN_PASSWORD       = "test-admin-password"
}

run "platform_database" {
  command = plan

  assert {
    condition     = aws_rds_cluster.platform.engine == "aurora-postgresql" && aws_rds_cluster.platform.database_name == "platform" && aws_rds_cluster.platform.master_username == "platform_admin"
    error_message = "The cluster must hold the platform database, owned by platform_admin."
  }
  assert {
    condition     = aws_rds_cluster.platform.serverlessv2_scaling_configuration[0].min_capacity == 0 && aws_rds_cluster.platform.serverlessv2_scaling_configuration[0].seconds_until_auto_pause == 300
    error_message = "The cluster must pause after 5 idle minutes, so an idle demo costs only storage."
  }
  assert {
    condition     = aws_rds_cluster.platform.storage_encrypted && aws_rds_cluster.platform.deletion_protection && aws_rds_cluster.platform.skip_final_snapshot != true && aws_rds_cluster.platform.final_snapshot_identifier != null
    error_message = "The cluster must be encrypted, protected from deletion, and snapshotted before removal."
  }
  assert {
    condition     = aws_rds_cluster_instance.platform.instance_class == "db.serverless" && !aws_rds_cluster_instance.platform.publicly_accessible && aws_rds_cluster_instance.platform.engine_version == aws_rds_cluster.platform.engine_version
    error_message = "The instance must be a private serverless instance on the cluster's version."
  }
  assert {
    condition     = aws_vpc_security_group_ingress_rule.database_from_clients.from_port == aws_rds_cluster.platform.port && aws_vpc_security_group_ingress_rule.database_from_clients.to_port == aws_rds_cluster.platform.port && aws_vpc_security_group_ingress_rule.database_from_clients.cidr_ipv4 == null
    error_message = "The database must accept only its client group, on its own port."
  }
  assert {
    condition     = aws_vpc_security_group_egress_rule.clients_to_database.from_port == aws_rds_cluster.platform.port && aws_vpc_security_group_egress_rule.clients_to_database.cidr_ipv4 == null
    error_message = "Database clients must reach only the database."
  }
}

run "admin_password_rules" {
  command = plan

  variables {
    DATABASE_ADMIN_PASSWORD = "has/slash"
  }

  expect_failures = [var.DATABASE_ADMIN_PASSWORD]
}
