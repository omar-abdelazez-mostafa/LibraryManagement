#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../infra"

terraform_state_has() {
  # Read the complete command output. grep -q exits as soon as it finds a
  # match, which can close Terraform's stdout pipe and make the Terraform
  # wrapper fail with EPIPE even though the address exists in state.
  terraform state list | awk -v address="$1" '$0 == address { found = 1 } END { exit !found }'
}

import_if_needed() {
  local address="$1"
  local identifier="$2"
  if [[ -n "$identifier" && "$identifier" != "None" ]] && ! terraform_state_has "$address"; then
    echo "Importing existing AWS resource: $address"
    terraform import -input=false "$address" "$identifier"
  fi
}

query_id() {
  aws "$@" --output text
}

vpc_id=$(query_id ec2 describe-vpcs \
  --filters Name=tag:Project,Values=library-management Name=cidr-block,Values=10.0.0.0/16 \
  --query 'Vpcs[0].VpcId')

if [[ -z "$vpc_id" || "$vpc_id" == "None" ]]; then
  echo "No existing library VPC found; Terraform will create the infrastructure."
  exit 0
fi

import_if_needed aws_vpc.main "$vpc_id"

igw_id=$(query_id ec2 describe-internet-gateways \
  --filters "Name=attachment.vpc-id,Values=$vpc_id" Name=tag:Project,Values=library-management \
  --query 'InternetGateways[0].InternetGatewayId')
import_if_needed aws_internet_gateway.igw "$igw_id"

subnet_a_id=$(query_id ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$vpc_id" Name=cidr-block,Values=10.0.1.0/24 \
  --query 'Subnets[0].SubnetId')
subnet_b_id=$(query_id ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$vpc_id" Name=cidr-block,Values=10.0.2.0/24 \
  --query 'Subnets[0].SubnetId')
import_if_needed aws_subnet.subnet_a "$subnet_a_id"
import_if_needed aws_subnet.subnet_b "$subnet_b_id"

route_table_id=$(query_id ec2 describe-route-tables \
  --filters "Name=vpc-id,Values=$vpc_id" Name=tag:Name,Values=library-public-rt \
  --query 'RouteTables[0].RouteTableId')
import_if_needed aws_route_table.public_rt "$route_table_id"

if [[ "$route_table_id" != "None" && "$subnet_a_id" != "None" ]]; then
  import_if_needed aws_route_table_association.rta_subnet_a "$subnet_a_id/$route_table_id"
fi
if [[ "$route_table_id" != "None" && "$subnet_b_id" != "None" ]]; then
  import_if_needed aws_route_table_association.rta_subnet_b "$subnet_b_id/$route_table_id"
fi

bastion_sg_id=$(query_id ec2 describe-security-groups \
  --filters "Name=vpc-id,Values=$vpc_id" Name=group-name,Values=librarymanagement-bastion-sg \
  --query 'SecurityGroups[0].GroupId')
k8s_sg_id=$(query_id ec2 describe-security-groups \
  --filters "Name=vpc-id,Values=$vpc_id" Name=group-name,Values=librarymanagement-kubeadm-sg \
  --query 'SecurityGroups[0].GroupId')
import_if_needed aws_security_group.bastion_sg "$bastion_sg_id"
import_if_needed aws_security_group.k8s_sg "$k8s_sg_id"

import_instance() {
  local address="$1"
  local name="$2"
  local instance_id
  instance_id=$(query_id ec2 describe-instances \
    --filters "Name=vpc-id,Values=$vpc_id" "Name=tag:Name,Values=$name" \
      Name=tag:Project,Values=library-management \
      Name=instance-state-name,Values=pending,running,stopping,stopped \
    --query 'Reservations[0].Instances[0].InstanceId')
  import_if_needed "$address" "$instance_id"
}

import_instance aws_instance.bastion library-bastion
import_instance aws_instance.master library-master
import_instance aws_instance.worker1 library-worker-1
import_instance aws_instance.worker2 library-worker-2

