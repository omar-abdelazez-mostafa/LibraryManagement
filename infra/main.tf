########################################
# Provider
########################################
provider "aws" {
  region = var.aws_region
}

########################################
# VPC
########################################
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name    = "library-vpc"
    Project = "library-management"
  }
}

########################################
# Internet Gateway
########################################
resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name    = "library-igw"
    Project = "library-management"
  }
}

########################################
# Subnets
########################################
resource "aws_subnet" "subnet_a" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = "${var.aws_region}a"
  map_public_ip_on_launch = true

  tags = {
    Name    = "library-subnet-a"
    Project = "library-management"
  }
}

resource "aws_subnet" "subnet_b" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.2.0/24"
  availability_zone       = "${var.aws_region}b"
  map_public_ip_on_launch = true

  tags = {
    Name    = "library-subnet-b"
    Project = "library-management"
  }
}

########################################
# Route Table
########################################
resource "aws_route_table" "public_rt" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }

  tags = {
    Name    = "library-public-rt"
    Project = "library-management"
  }
}

resource "aws_route_table_association" "rta_subnet_a" {
  subnet_id      = aws_subnet.subnet_a.id
  route_table_id = aws_route_table.public_rt.id
}

resource "aws_route_table_association" "rta_subnet_b" {
  subnet_id      = aws_subnet.subnet_b.id
  route_table_id = aws_route_table.public_rt.id
}

########################################
# Security Group — Bastion Server
########################################
resource "aws_security_group" "bastion_sg" {
  name        = "librarymanagement-bastion-sg"
  description = "Allow SSH from internet to bastion only"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "SSH from internet"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "librarymanagement-bastion-sg"
    Project = "library-management"
  }
}

########################################
# Security Group — Kubernetes Nodes
########################################
resource "aws_security_group" "k8s_sg" {
  name        = "librarymanagement-kubeadm-sg"
  description = "Security group for Kubeadm cluster nodes"
  vpc_id      = aws_vpc.main.id

  # SSH only from Bastion server
  ingress {
    description = "Library website NodePort"
    from_port   = 30080
    to_port     = 30080
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description     = "SSH from Bastion only"
    from_port       = 22
    to_port         = 22
    protocol        = "tcp"
    security_groups = [aws_security_group.bastion_sg.id]
  }

  # Allow all internal VPC traffic (between nodes)
  ingress {
    description = "All VPC internal traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["10.0.0.0/16"]
  }

  # Allow all outbound
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "librarymanagement-kubeadm-sg"
    Project = "library-management"
  }
}

########################################
# Data Source — Latest Ubuntu 22.04 LTS AMI (Free Tier)
########################################
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

########################################
# EC2 Instances — Free Tier (Pure Infrastructure)
########################################

# Bastion Server — Subnet A (public)
resource "aws_instance" "bastion" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = "t3.micro"
  subnet_id              = aws_subnet.subnet_a.id
  private_ip             = "10.0.1.100"
  vpc_security_group_ids = [aws_security_group.bastion_sg.id]
  key_name               = var.key_name

  root_block_device {
    volume_size = 8
    volume_type = "gp2"
  }

  tags = {
    Name    = "library-bastion"
    Role    = "bastion"
    Project = "library-management"
  }
}

# Master Node (Control Plane) — Subnet A
resource "aws_instance" "master" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = "t3.micro"
  subnet_id              = aws_subnet.subnet_a.id
  private_ip             = "10.0.1.10"
  vpc_security_group_ids = [aws_security_group.k8s_sg.id]
  key_name               = var.key_name

  root_block_device {
    volume_size = 10
    volume_type = "gp2"
  }

  tags = {
    Name    = "library-master"
    Role    = "control-plane"
    Project = "library-management"
  }
}

# Worker Node 1 — Subnet A
resource "aws_instance" "worker1" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = "t3.micro"
  subnet_id              = aws_subnet.subnet_a.id
  private_ip             = "10.0.1.20"
  vpc_security_group_ids = [aws_security_group.k8s_sg.id]
  key_name               = var.key_name

  root_block_device {
    volume_size = 8
    volume_type = "gp2"
  }

  tags = {
    Name    = "library-worker-1"
    Role    = "worker"
    Project = "library-management"
  }
}

# Worker Node 2 — Subnet B
resource "aws_instance" "worker2" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = "t3.micro"
  subnet_id              = aws_subnet.subnet_b.id
  private_ip             = "10.0.2.20"
  vpc_security_group_ids = [aws_security_group.k8s_sg.id]
  key_name               = var.key_name

  root_block_device {
    volume_size = 8
    volume_type = "gp2"
  }

  tags = {
    Name    = "library-worker-2"
    Role    = "worker"
    Project = "library-management"
  }
}

########################################
# Dynamic Ansible Inventory Generation
########################################
resource "local_file" "ansible_inventory" {
  filename        = "${path.module}/../ansible/inventory.ini"
  file_permission = "0600"
  content         = <<-EOT
[bastion]
bastion_host ansible_host=${aws_instance.bastion.public_ip} ansible_user=ubuntu

[master]
master_host ansible_host=${aws_instance.master.private_ip} ansible_user=ubuntu

[workers]
worker1 ansible_host=${aws_instance.worker1.private_ip} ansible_user=ubuntu
worker2 ansible_host=${aws_instance.worker2.private_ip} ansible_user=ubuntu

[k8s_cluster:children]
master
workers

[all:vars]
ansible_ssh_private_key_file=${var.pem_file_path}

[master:vars]
ansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ProxyCommand="ssh -W %h:%p -q -i ${var.pem_file_path} -o StrictHostKeyChecking=no ubuntu@${aws_instance.bastion.public_ip}"'

[workers:vars]
ansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ProxyCommand="ssh -W %h:%p -q -i ${var.pem_file_path} -o StrictHostKeyChecking=no ubuntu@${aws_instance.bastion.public_ip}"'
EOT
}

resource "local_file" "ssh_config" {
  filename        = "${path.module}/../ansible/ssh_config.generated"
  file_permission = "0600"
  content         = <<-EOT
Host bastion
  HostName ${aws_instance.bastion.public_ip}
  User ubuntu
  IdentityFile ~/.ssh/depi-task.pem
  IdentitiesOnly yes

Host master
  HostName ${aws_instance.master.private_ip}
  User ubuntu
  IdentityFile ~/.ssh/depi-task.pem
  IdentitiesOnly yes
  ProxyJump bastion

Host worker-1
  HostName ${aws_instance.worker1.private_ip}
  User ubuntu
  IdentityFile ~/.ssh/depi-task.pem
  IdentitiesOnly yes
  ProxyJump bastion

Host worker-2
  HostName ${aws_instance.worker2.private_ip}
  User ubuntu
  IdentityFile ~/.ssh/depi-task.pem
  IdentitiesOnly yes
  ProxyJump bastion
EOT
}

