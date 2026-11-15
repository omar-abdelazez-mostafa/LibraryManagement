########################################
# Variables
########################################

variable "aws_region" {
  description = "AWS region to deploy resources into"
  type        = string
  default     = "eu-west-3" # Paris
}

variable "key_name" {
  description = "Name of the existing AWS key pair (matches your depi-task.pem)"
  type        = string
  default     = "depi-task"
}

variable "pem_file_path" {
  description = "Local path to your PEM private key file (used in SSH output commands)"
  type        = string
  default     = "C:/Users/myfin/Downloads/depi-task.pem"
}
