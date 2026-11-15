# Open Shelf Library

A small library management website built as a three layer application: a responsive browser UI, a Node.js API, and PostgreSQL. Members can register, log in, browse and search the catalogue, add books to a cart, record purchases, borrow books, and return them. Members have separate Borrowed, Bought, and Cart pages. The cart is saved in that browser; checkout records each completed purchase and stock change in PostgreSQL. Administrators can add, edit, and remove books from the inventory manager. Inventory changes and transaction history are stored in PostgreSQL.

## Architecture

| Layer | Implementation |
| --- | --- |
| Frontend | HTML, CSS, and JavaScript served by Nginx |
| Backend | Express API for authentication, catalogue, inventory, and transactions |
| Database | PostgreSQL with persistent Kubernetes volume |
| Orchestration | kubeadm cluster with Kubernetes Deployments, Services, and PersistentVolume |
| Infrastructure | Terraform on AWS Paris (`eu-west-3`) |
| Configuration and CI/CD | Ansible and GitHub Actions |

The catalogue seeds eight sample titles the first time the API starts against an empty database. Cover images are fetched from Open Library. Buying records a demo purchase and updates stock; it does not collect payment. Library inventory endpoints are restricted to the configured administrator email.

Opening `frontend/index.html` directly shows a browser preview with a sample catalogue and local-only demo actions. That preview does not connect to PostgreSQL or provide real authentication. The deployed Nginx site uses the API and shared database.

## Deploy from GitHub Actions

The repository workflow is the deployment entry point. Push to `main` to build and publish the frontend/API images, create the AWS resources, configure kubeadm with Ansible, and apply the Kubernetes manifests. Use **Actions → Deploy Open Shelf → Run workflow** with `destroy` to remove AWS infrastructure when finished.

Add these GitHub Actions repository secrets before the first push:

| Secret | Purpose |
| --- | --- |
| `AWS_ACCESS_KEY_ID` | AWS access key allowed to manage the cluster and Terraform state bucket |
| `AWS_SECRET_ACCESS_KEY` | Matching AWS secret |
| `SSH_PRIVATE_KEY` | Private key for the existing EC2 key pair named `depi-task` in `eu-west-3` |
| `DATABASE_PASSWORD` | Strong password for the PostgreSQL application user |
| `JWT_SECRET` | Long random secret used to sign login tokens |
The workflow uses its built-in `GITHUB_TOKEN` to publish images to GitHub Container Registry and configure cluster image pulls. Never commit these values or a private key. Terraform state is kept in a separate private, encrypted, versioned S3 bucket named for the AWS account and region.

Terraform uses four `t3.micro` Ubuntu nodes and small root volumes in Paris, following the companion kubeadm project. Confirm your AWS account's current free tier, instance quota, and storage allowance before deployment; AWS charges can apply. The app's database uses a 2 GiB local Kubernetes volume on worker 1, so its data survives pod restarts but not deletion of that EC2 node or Terraform infrastructure.

After a successful workflow, open the `library_website_url` Terraform output (or the worker 1 public IP on port `30080`). Download the `library-management-ssh-config` artifact from the same Actions run if you want the generated SSH configuration.

The first administrator account is registered with `admin@openshelf.local`. The backend grants the administrator role only to that configured email. The protected inventory API supports:

- `POST /api/books` with `title`, `author`, `category`, optional `cover_image`, `price`, and `total_quantity`.
- `PATCH /api/books/:id/inventory` with `total_quantity`.

Every inventory change requires the administrator's Bearer token. The inventory page offers create, edit, and remove controls. Catalogue removal is a soft delete so past purchases and loans remain in history.

## API routes

| Method and route | Purpose |
| --- | --- |
| `POST /api/auth/register` | Create an account with name, email, and password |
| `POST /api/auth/login` | Log in with email and password |
| `POST /api/auth/logout` | Logout acknowledgement; the browser clears its token |
| `GET /api/books` | Browse the catalogue and stock |
| `POST /api/transactions/buy` | Record a purchase and decrement stock |
| `POST /api/transactions/borrow` | Borrow a book |
| `GET /api/transactions/mine` | View the signed-in member's books |
| `POST /api/transactions/:id/return` | Return an active borrowed book |
| `POST /api/books`, `PATCH /api/books/:id`, `DELETE /api/books/:id` | Add, edit, or remove a catalogue book |
| `PATCH /api/books/:id/inventory` | Adjust the total stock count |

Passwords are hashed with bcrypt. Purchase and borrowing operations use database transactions so competing requests cannot decrement the same last copy.

## Repository structure

```text
frontend/                 Responsive catalogue and Nginx configuration
backend/src/server.js     Authentication, inventory, and transaction API
k8s/                      Namespace, app services, and persistent PostgreSQL
main.tf                   Paris VPC, security groups, bastion, and kubeadm nodes
ansible/site.yml          Configure kubeadm and label the storage worker
ansible/deploy-library.yml Deploy secrets and the application to Kubernetes
.github/workflows/        Build, provision, configure, and deploy pipeline
```
