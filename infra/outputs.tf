########################################
# Outputs
########################################

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "subnet_a_id" {
  description = "Subnet A ID (10.0.1.0/24)"
  value       = aws_subnet.subnet_a.id
}

output "subnet_b_id" {
  description = "Subnet B ID (10.0.2.0/24)"
  value       = aws_subnet.subnet_b.id
}

# ── Bastion ──────────────────────────────────────
output "bastion_public_ip" {
  description = "Bastion server public IP (your entry point)"
  value       = aws_instance.bastion.public_ip
}

output "bastion_private_ip" {
  description = "Bastion server private IP"
  value       = aws_instance.bastion.private_ip
}

output "ssh_to_bastion" {
  description = "SSH into the bastion server"
  value       = "ssh -i ${var.pem_file_path} ubuntu@${aws_instance.bastion.public_ip}"
}

# ── Master Node ──────────────────────────────────
output "master_private_ip" {
  description = "Master node private IP"
  value       = aws_instance.master.private_ip
}

output "ssh_to_master" {
  description = "SSH to master via bastion (ProxyJump)"
  value       = "ssh -i ${var.pem_file_path} -J ubuntu@${aws_instance.bastion.public_ip} ubuntu@${aws_instance.master.private_ip}"
}

# ── Worker Node 1 ─────────────────────────────────
output "worker1_private_ip" {
  description = "Worker Node 1 private IP"
  value       = aws_instance.worker1.private_ip
}

output "library_website_url" {
  description = "Open Shelf website URL after the application workflow succeeds"
  value       = "http://${aws_instance.worker1.public_ip}:30080"
}

output "ssh_to_worker1" {
  description = "SSH to worker1 via bastion (ProxyJump)"
  value       = "ssh -i ${var.pem_file_path} -J ubuntu@${aws_instance.bastion.public_ip} ubuntu@${aws_instance.worker1.private_ip}"
}

# ── Worker Node 2 ─────────────────────────────────
output "worker2_private_ip" {
  description = "Worker Node 2 private IP"
  value       = aws_instance.worker2.private_ip
}

output "ssh_to_worker2" {
  description = "SSH to worker2 via bastion (ProxyJump)"
  value       = "ssh -i ${var.pem_file_path} -J ubuntu@${aws_instance.bastion.public_ip} ubuntu@${aws_instance.worker2.private_ip}"
}

# ── Cluster Check ─────────────────────────────────
output "check_cluster_from_laptop" {
  description = "Check cluster node status in one shot from your local terminal"
  value       = "ssh -i ${var.pem_file_path} -J ubuntu@${aws_instance.bastion.public_ip} ubuntu@${aws_instance.master.private_ip} \"kubectl get nodes\""
}

# ── Ansible Command ───────────────────────────────
output "ansible_run_command" {
  description = "Run Ansible playbook manually"
  value       = "cd ansible && ansible-playbook -i inventory.ini site.yml"
}
