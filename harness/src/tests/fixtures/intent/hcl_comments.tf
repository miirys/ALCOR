# Non-empty comment
# This is a non-empty comment
terraform {
  required_version = ">= 1.0.0"
  /*
    This is a block comment
    It spans multiple lines
  */

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 4.0.0"
    }
  }
}

# Empty comment
#
provider "aws" {
  region = "us-west-2" # Specify the AWS region to deploy resources in
}
