terraform {
  required_providers {
    aws = {
      // The provider comes from registry.terraform.io/hashicorp/aws.
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

// Configures the AWS provider.
provider "aws" {
  region = "us-east-1"
}

resource "aws_s3_bucket" "terraform_state" {
  bucket = "gabriel-roriz-tf-state-file-example-1"

  // Prevent accidental deletion of this S3 bucket.
  lifecycle {
    prevent_destroy = true
  }
}
