// The platform database, an Aurora PostgreSQL cluster with one schema per concern.
// It runs in the default VPC, so no network needs managing.

variable "DATABASE_ADMIN_PASSWORD" {
  type        = string
  sensitive   = true
  description = "Password of platform_admin, which owns the platform database"

  // Aurora accepts 8 to 41 printable ASCII characters, except /, ", and @.
  validation {
    condition     = can(regex("^[!#-.0-?A-~]{8,41}$", var.DATABASE_ADMIN_PASSWORD))
    error_message = "DATABASE_ADMIN_PASSWORD must be 8 to 41 printable characters, without /, \", @, or spaces."
  }
}

locals {
  # Upgraded together with the Compose image, so local and AWS run the same version.
  database_engine_version = "16.14"
  # Must match the port the SQL client connects to.
  database_port = 5432
}

data "aws_vpc" "default" {
  default = true
}

// Serverless instances are offered in only some of the region's zones.
data "aws_rds_orderable_db_instance" "platform" {
  engine         = "aurora-postgresql"
  engine_version = local.database_engine_version
  instance_class = "db.serverless"
  // Aurora Standard storage, the cluster's default, costs less at low I/O.
  storage_type = "aurora"
}

data "aws_subnets" "database" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
  filter {
    name   = "default-for-az"
    values = ["true"]
  }
  filter {
    name   = "availability-zone"
    values = data.aws_rds_orderable_db_instance.platform.availability_zones
  }
}

resource "aws_db_subnet_group" "platform" {
  name       = "platform"
  subnet_ids = data.aws_subnets.database.ids
}

// Functions that connect to the database run in this group, its only client.
resource "aws_security_group" "database_clients" {
  name        = "database-clients"
  description = "Functions that connect to the platform database"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_security_group" "database" {
  name        = "platform-database"
  description = "The platform database, reachable only from its client functions"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_ingress_rule" "database_from_clients" {
  security_group_id            = aws_security_group.database.id
  referenced_security_group_id = aws_security_group.database_clients.id
  ip_protocol                  = "tcp"
  from_port                    = local.database_port
  to_port                      = local.database_port
}

// Clients may only reach the database, the one network peer they need.
resource "aws_vpc_security_group_egress_rule" "clients_to_database" {
  security_group_id            = aws_security_group.database_clients.id
  referenced_security_group_id = aws_security_group.database.id
  ip_protocol                  = "tcp"
  from_port                    = local.database_port
  to_port                      = local.database_port
}

resource "aws_rds_cluster" "platform" {
  cluster_identifier     = "platform"
  engine                 = "aurora-postgresql"
  engine_version         = local.database_engine_version
  database_name          = "platform"
  master_username        = "platform_admin"
  master_password        = var.DATABASE_ADMIN_PASSWORD
  port                   = local.database_port
  db_subnet_group_name   = aws_db_subnet_group.platform.name
  vpc_security_group_ids = [aws_security_group.database.id]
  storage_encrypted      = true

  // The history is kept for years, so neither a destroy nor a mistake may lose it.
  deletion_protection       = true
  final_snapshot_identifier = "platform-final"
  backup_retention_period   = 7

  // The cluster pauses after 5 idle minutes and then costs only its storage.
  serverlessv2_scaling_configuration {
    min_capacity             = 0
    max_capacity             = 2
    seconds_until_auto_pause = 300
  }
}

resource "aws_rds_cluster_instance" "platform" {
  identifier          = "platform-1"
  cluster_identifier  = aws_rds_cluster.platform.id
  instance_class      = "db.serverless"
  engine              = aws_rds_cluster.platform.engine
  engine_version      = aws_rds_cluster.platform.engine_version
  publicly_accessible = false
  // The version changes only with the Compose image, never on its own.
  auto_minor_version_upgrade = false
}
