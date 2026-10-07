terraform {
  required_providers {
    aws = {
      // registry.terraform.io/hashicorp/aws
      source  = "hashicorp/aws"
      version = "~> 6.67"
    }
  }
  backend "s3" {
    bucket = "gabriel-roriz-tf-state-file-example-1"
    key    = "my_lambda/terraform.tfstate"
    region = "us-east-1"
  }

  required_version = ">= 1.16.5"
}

// configure the aws provider
provider "aws" {
  region = "us-east-1"
}

resource "aws_s3_bucket" "terraform_state" {
  bucket = "gabriel-roriz-tf-state-file-example-1"

  // Prevent accidental deletion of this S3 bucket
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_role" "ts_lambda_role" {
  name = "ts_lambda-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_lambda_function" "ts_lambda" {
  filename         = "${path.module}/../dist/lambda_function_${var.lambdasVersion}.zip"
  source_code_hash = filebase64sha256("${path.module}/../dist/lambda_function_${var.lambdasVersion}.zip")
  function_name    = "ts_lambda"
  role             = aws_iam_role.ts_lambda_role.arn
  handler          = "index.handler"
  runtime          = "nodejs24.x"
  memory_size      = 1024
  timeout          = 300
}
